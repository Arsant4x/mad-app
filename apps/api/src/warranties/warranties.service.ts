import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { dayStartOf } from '../common/wall-clock.util';
import { CreateWarrantyDto, UpdateWarrantyDto } from './dto/warranty.dto';
import { ListWarrantiesQueryDto } from './dto/list-warranties-query.dto';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { mapList, pageArray, pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة للضمانات (`ق-١٢٣٦`) — الموضوعُ والمزوّدُ والمرجع. */
const WARRANTY_SEARCH_FIELDS = ['subject', 'provider', 'reference'] as const;

/**
 * Warranties on what is installed in a property.
 *
 * The point of this module is not the list. It is `coverFor()` — the question
 * "is this fault somebody else's bill?" asked at the moment a fault is
 * reported. A warranty remembered a week after the invoice is paid has cost
 * the landlord exactly as much as no warranty at all.
 */

const WARRANTY_INCLUDE = {
  property: { select: { id: true, name: true } },
  unit: { select: { id: true, unitNo: true } },
  supplier: { select: { id: true, name: true } },
  _count: { select: { claims: true } },
};

/** يومُ الآن بإزاحةٍ معلَنة لا بمنطقة العملية (`ق-١١٩٠`) — فـ`daysLeft` رقمٌ يقرؤه التاجر. */
const startOfDay = (d: Date): Date => dayStartOf(d);

function daysUntil(date: Date, from: Date): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(from).getTime()) / 86400000);
}

@Injectable()
export class WarrantiesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, query?: ListWarrantiesQueryDto) {
    const where: Prisma.WarrantyWhereInput = {
      ...(query?.propertyId ? { propertyId: query.propertyId } : {}),
      ...searchWhere(searchTerm(query), WARRANTY_SEARCH_FIELDS),
    };
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const result = await pagedFindMany(query, tx.warranty, {
        where,
        include: WARRANTY_INCLUDE,
        // Soonest to expire first: the ones about to lapse are the ones worth
        // acting on, and an alphabetical list hides them.
        orderBy: { endDate: 'asc' },
      });

      const today = new Date();
      // `daysLeft` is derived, never stored: a stored countdown is wrong the
      // day after it is written.
      return mapList(result, (w) => ({ ...w, daysLeft: daysUntil(w.endDate, today), expired: daysUntil(w.endDate, today) < 0 }));
    });
  }

  findOne(companyId: string, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const found = await tx.warranty.findUnique({
        where: { id },
        include: {
          ...WARRANTY_INCLUDE,
          claims: {
            select: { id: true, title: true, status: true, reportedAt: true, cost: true },
            orderBy: { reportedAt: 'desc' },
          },
        },
      });
      if (!found) throw new NotFoundException(MSG.warranty_not_found);
      return { ...found, daysLeft: daysUntil(found.endDate, new Date()) };
    });
  }

  /**
   * What still covers this location on this date.
   *
   * Takes the *fault* date, not today: a job reported while cover was live is
   * claimable even if it is being logged three weeks later. Using today's date
   * here would quietly deny valid claims.
   */
  coverFor(companyId: string, propertyId: string, unitId: string | undefined, onDate: Date, query?: PagedQueryDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // `coverForTx` يبقى الدالّةَ الواحدة التي تسأل «ما يغطّي هذا الموقعَ اليوم؟» (تستعملها الصيانةُ أيضاً)؛
      // والقائمةُ هنا تُرشَّح بالبحث وتُقطَع فوقها لا داخلها (`ق-١٢٣٦`).
      const rows = await coverForTx(tx, propertyId, unitId, onDate);
      return pageArray(query, rows, WARRANTY_SEARCH_FIELDS);
    });
  }

  create(companyId: string, dto: CreateWarrantyDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const start = new Date(dto.startDate);
      const end = new Date(dto.endDate);
      // Cover that ends before it starts is a typo, and it would silently
      // match nothing forever.
      if (end < start) throw new BadRequestException(MSG.warranty_end_before_start);

      await assertLocation(tx, dto.propertyId, dto.unitId);
      if (dto.supplierId) {
        const supplier = await tx.supplier.findUnique({ where: { id: dto.supplierId } });
        if (!supplier) throw new NotFoundException(MSG.supplier_not_found);
      }

      const created = await tx.warranty.create({
        data: {
          subject: dto.subject.trim(),
          propertyId: dto.propertyId,
          unitId: dto.unitId ?? null,
          provider: dto.provider.trim(),
          supplierId: dto.supplierId ?? null,
          startDate: start,
          endDate: end,
          reference: dto.reference?.trim() || null,
          terms: dto.terms?.trim() || null,
          notes: dto.notes?.trim() || null,
        } as unknown as Prisma.WarrantyUncheckedCreateInput,
      });

      return tx.warranty.findUniqueOrThrow({ where: { id: created.id }, include: WARRANTY_INCLUDE });
    });
  }

  update(companyId: string, id: string, dto: UpdateWarrantyDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.warranty.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.warranty_not_found);

      const start = dto.startDate ? new Date(dto.startDate) : existing.startDate;
      const end = dto.endDate ? new Date(dto.endDate) : existing.endDate;
      if (end < start) throw new BadRequestException(MSG.warranty_end_before_start);

      if (dto.unitId) await assertLocation(tx, existing.propertyId, dto.unitId);

      return tx.warranty.update({
        where: { id },
        data: {
          ...(dto.subject !== undefined ? { subject: dto.subject.trim() } : {}),
          ...(dto.unitId !== undefined ? { unitId: dto.unitId } : {}),
          ...(dto.provider !== undefined ? { provider: dto.provider.trim() } : {}),
          ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId } : {}),
          ...(dto.startDate !== undefined ? { startDate: start } : {}),
          ...(dto.endDate !== undefined ? { endDate: end } : {}),
          ...(dto.reference !== undefined ? { reference: dto.reference.trim() || null } : {}),
          ...(dto.terms !== undefined ? { terms: dto.terms.trim() || null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
        },
        include: WARRANTY_INCLUDE,
      });
    });
  }

  remove(companyId: string, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.warranty.findUnique({ where: { id }, include: { _count: { select: { claims: true } } } });
      if (!existing) throw new NotFoundException(MSG.warranty_not_found);
      // A warranty already claimed against is the evidence behind those jobs.
      // Deleting it would leave the maintenance history unexplained.
      if (existing._count.claims > 0) throw new BadRequestException(MSG.warranty_has_claims);

      await tx.warranty.delete({ where: { id } });
      return { deleted: true };
    });
  }
}

/** Shared by the service and the expiry sweep, so both agree on what "covered"
 * means. */
export function coverForTx(tx: Prisma.TransactionClient, propertyId: string, unitId: string | undefined, onDate: Date) {
  return tx.warranty.findMany({
    where: {
      propertyId,
      // A property-wide warranty covers every unit in it, so `null` always
      // counts; a unit-specific one only counts for that unit.
      ...(unitId ? { OR: [{ unitId: null }, { unitId }] } : { unitId: null }),
      startDate: { lte: onDate },
      endDate: { gte: onDate },
    },
    include: { supplier: { select: { id: true, name: true } }, unit: { select: { id: true, unitNo: true } } },
    orderBy: [{ endDate: 'asc' }, { id: 'asc' }], // ترتيبٌ تامّ — `/warranties/cover` تُقطَع في الذاكرة (`ق-٣٥٦`)
  });
}

async function assertLocation(tx: Prisma.TransactionClient, propertyId: string, unitId?: string | null): Promise<void> {
  const property = await tx.property.findUnique({ where: { id: propertyId } });
  if (!property) throw new NotFoundException(MSG.property_not_found);

  if (unitId) {
    const unit = await tx.unit.findUnique({ where: { id: unitId } });
    // A unit in a different building would attach cover to a lift that isn't
    // there.
    if (!unit || unit.propertyId !== propertyId) throw new BadRequestException(MSG.unit_not_in_property);
  }
}
