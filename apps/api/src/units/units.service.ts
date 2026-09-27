import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Unit } from '@mad-app/db';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { expireStaleReservations } from '../reservations/reservations.service';
import { BulkCreateUnitsDto } from './dto/bulk-create-units.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { formatMessage, MSG } from '../common/i18n/messages';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pageArray } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — رقمُ الوحدة ونوعُها وطابقُها. */
const UNIT_SEARCH_FIELDS = ['unitNo', 'type', 'subtype', 'floor'] as const;

export type UnitStatus = 'vacant' | 'rented' | 'maintenance' | 'reserved' | 'upcoming';

@Injectable()
export class UnitsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, includeArchived = false, query?: PagedQueryDto) {
    // الحالةُ محسوبةٌ لكل وحدة (عقدٌ ساري · قادم · حجز) فتُقطَع القائمةُ في الذاكرة بعد الحساب.
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => pageArray(query, await this.listWithStatus(tx, includeArchived), UNIT_SEARCH_FIELDS));
  }

  create(companyId: string, dto: CreateUnitDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const property = await tx.property.findUnique({ where: { id: dto.propertyId } });
      if (!property) throw new NotFoundException(MSG.property_not_found);

      try {
        return await tx.unit.create({
          data: {
            propertyId: dto.propertyId,
            unitNo: dto.unitNo,
            floor: dto.floor,
            type: dto.type,
            subtype: dto.subtype,
            rentMonthly: dto.rentMonthly,
            roomDetails: dto.roomDetails,
            underMaintenance: dto.underMaintenance ?? false,
          } as unknown as Prisma.UnitCreateInput,
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(formatMessage(MSG.unit_number_taken, { unitNo: dto.unitNo }));
        }
        throw e;
      }
    });
  }

  /**
   * إنشاء بالجملة (§16): بادئة + عدد، كل شيء أو لا شيء — أي تصادم في
   * الأرقام يُرفض قبل إنشاء أي وحدة، ويُسمّي الأرقام المتصادمة.
   */
  createBulk(companyId: string, dto: BulkCreateUnitsDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const property = await tx.property.findUnique({ where: { id: dto.propertyId } });
      if (!property) throw new NotFoundException(MSG.property_not_found);

      const start = dto.startAt ?? 1;
      const numbers = Array.from({ length: dto.count }, (_, i) => `${dto.prefix}${start + i}`);
      // فحصان: الحيّ، ثم المُهمل في السلة — فهرس الفرادة يراهما معاً بينما
      // مرشّح الحذف الناعم يخفي الثاني عن الفحص العادي (اكتشاف المراجعة).
      const clashes = await tx.unit.findMany({ where: { propertyId: dto.propertyId, unitNo: { in: numbers } }, select: { unitNo: true } });
      const trashed = await tx.unit.findMany({ where: { propertyId: dto.propertyId, unitNo: { in: numbers }, deletedAt: { not: null } }, select: { unitNo: true } });
      if (clashes.length || trashed.length) {
        const names = [...clashes.map((c) => c.unitNo), ...trashed.map((c) => c.unitNo + ' (في سلة المحذوفات)')];
        throw new ConflictException(formatMessage(MSG.bulk_units_collision, { units: names.join('، ') }));
      }

      try {
      await tx.unit.createMany({
        data: numbers.map((unitNo) => ({
          companyId,
          propertyId: dto.propertyId,
          unitNo,
          floor: dto.floor,
          type: dto.type,
          subtype: dto.subtype,
          rentMonthly: dto.rentMonthly,
        })),
      });
      } catch (e) {
        // سباق مع إنشاء متزامن بعد الفحص — نفس الرد المسمّى لا 500 خام.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(formatMessage(MSG.bulk_units_collision, { units: dto.prefix + '…' }));
        }
        throw e;
      }
      return { created: numbers.length, unitNos: numbers };
    });
  }

  update(companyId: string, id: string, dto: UpdateUnitDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.unit.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.unit_not_found);

      const data: Prisma.UnitUncheckedUpdateInput = {};
      if (dto.floor !== undefined) data.floor = dto.floor;
      if (dto.type !== undefined) data.type = dto.type;
      if (dto.subtype !== undefined) data.subtype = dto.subtype;
      if (dto.rentMonthly !== undefined) data.rentMonthly = dto.rentMonthly;
      if (dto.underMaintenance !== undefined) data.underMaintenance = dto.underMaintenance;
      if (dto.roomDetails !== undefined) data.roomDetails = dto.roomDetails;

      return tx.unit.update({ where: { id }, data });
    });
  }

  /** Hidden from day-to-day lists while staying in the books — archiving
   * is presentation, deletion is the trash. */
  setArchived(companyId: string, id: string, archived: boolean) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.unit.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.unit_not_found);
      return tx.unit.update({ where: { id }, data: { archived } });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.unit.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.unit_not_found);
      // Checked explicitly rather than by catching a foreign-key error: a soft
      // delete never touches the FK, so the database can no longer be the one
      // refusing this. Same rule (CLAUDE.md 6.4), enforced where it's visible.
      // Counts historical contracts too — a unit that was ever let is history.
      const contractCount = await tx.contract.count({ where: { unitId: id } });
      if (contractCount > 0) throw new ConflictException(MSG.unit_has_contracts);

      // Soft delete — recoverable from the trash for 30 days.
      await tx.unit.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }

  /** Attaches a live-computed status to each unit — never stored, matching
   * the mockup's `unitStatusInfo`: under maintenance takes priority, then
   * whether a non-cancelled contract currently covers today, then whether an
   * active (non-expired) reservation holds the unit. */
  private async listWithStatus(tx: Prisma.TransactionClient, includeArchived = false): Promise<(Unit & { status: UnitStatus; currentTenant: string | null; upcomingTenant: string | null; reservedBy: string | null })[]> {
    await expireStaleReservations(tx);
    // `id` ختماً للترتيب التامّ (`ق-٣٥٦`) — القائمةُ تُقطَع في الذاكرة بعد اشتقاق الحالة.
    const units = await tx.unit.findMany({ ...(includeArchived ? {} : { where: { archived: false } }), orderBy: [{ propertyId: 'asc' }, { unitNo: 'asc' }, { id: 'asc' }] });
    const today = new Date();

    const activeContracts = await tx.contract.findMany({
      where: { start: { lte: today }, end: { gte: today }, status: { not: 'CANCELLED' } },
      select: { unitId: true, tenant: true },
    });
    const tenantByUnit = new Map(activeContracts.map((c) => [c.unitId, c.tenant]));

    // «محجوزة لعقد قادم مؤكَّد» (§16): عقدٌ لم يبدأ بعدُ وغير ملغى يحجز
    // الوحدة أقوى من حجز عادي — العقد سيحدث، والحجز قد لا يحدث.
    const upcomingContracts = await tx.contract.findMany({
      // DRAFT مستثنى عمداً: «المسودة قد لا تحدث، والقادم سيحدث» (تعليق المخطط
      // نفسه) — الشارة تقول «مؤكَّد» فلا يرفعها إلا عقدٌ مؤكَّد.
      where: { start: { gt: today }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
      select: { unitId: true, tenant: true },
    });
    const upcomingByUnit = new Map(upcomingContracts.map((c) => [c.unitId, c.tenant]));

    const activeReservations = await tx.reservation.findMany({ where: { status: 'ACTIVE' }, select: { unitId: true, name: true } });
    const reservationByUnit = new Map(activeReservations.map((r) => [r.unitId, r.name]));

    return units.map((u) => {
      const tenant = tenantByUnit.get(u.id) ?? null;
      const upcomingTenant = upcomingByUnit.get(u.id) ?? null;
      const reservedBy = reservationByUnit.get(u.id) ?? null;
      const status: UnitStatus = u.underMaintenance ? 'maintenance' : tenant ? 'rented' : upcomingTenant ? 'upcoming' : reservedBy ? 'reserved' : 'vacant';
      return { ...u, status, currentTenant: tenant, upcomingTenant: status === 'upcoming' ? upcomingTenant : null, reservedBy: status === 'reserved' ? reservedBy : null };
    });
  }
}
