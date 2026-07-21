import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Unit } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { expireStaleReservations } from '../reservations/reservations.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

export type UnitStatus = 'vacant' | 'rented' | 'maintenance' | 'reserved';

@Injectable()
export class UnitsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => this.listWithStatus(tx));
  }

  create(companyId: string, dto: CreateUnitDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const property = await tx.property.findUnique({ where: { id: dto.propertyId } });
      if (!property) throw new NotFoundException('العقار غير موجود');

      try {
        return await tx.unit.create({
          data: {
            propertyId: dto.propertyId,
            unitNo: dto.unitNo,
            floor: dto.floor,
            type: dto.type,
            subtype: dto.subtype,
            rentMonthly: dto.rentMonthly,
            underMaintenance: dto.underMaintenance ?? false,
          } as unknown as Prisma.UnitCreateInput,
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(`رقم الوحدة "${dto.unitNo}" مستخدَم بالفعل في هذا العقار`);
        }
        throw e;
      }
    });
  }

  update(companyId: string, id: string, dto: UpdateUnitDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.unit.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('الوحدة غير موجودة');

      const data: Prisma.UnitUncheckedUpdateInput = {};
      if (dto.floor !== undefined) data.floor = dto.floor;
      if (dto.type !== undefined) data.type = dto.type;
      if (dto.subtype !== undefined) data.subtype = dto.subtype;
      if (dto.rentMonthly !== undefined) data.rentMonthly = dto.rentMonthly;
      if (dto.underMaintenance !== undefined) data.underMaintenance = dto.underMaintenance;

      return tx.unit.update({ where: { id }, data });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.unit.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('الوحدة غير موجودة');
      try {
        await tx.unit.delete({ where: { id } });
      } catch (e) {
        // P2003 = foreign key violation — contracts.unitId is ON DELETE
        // RESTRICT, so this fires when the unit still has any contracts
        // (current or historical).
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
          throw new ConflictException('لا يمكن حذف وحدة مرتبطة بعقود — احذف عقودها أولاً');
        }
        throw e;
      }
    });
  }

  /** Attaches a live-computed status to each unit — never stored, matching
   * the mockup's `unitStatusInfo`: under maintenance takes priority, then
   * whether a non-cancelled contract currently covers today, then whether an
   * active (non-expired) reservation holds the unit. */
  private async listWithStatus(tx: Prisma.TransactionClient): Promise<(Unit & { status: UnitStatus; currentTenant: string | null; reservedBy: string | null })[]> {
    await expireStaleReservations(tx);
    const units = await tx.unit.findMany({ orderBy: [{ propertyId: 'asc' }, { unitNo: 'asc' }] });
    const today = new Date();

    const activeContracts = await tx.contract.findMany({
      where: { start: { lte: today }, end: { gte: today }, status: { not: 'CANCELLED' } },
      select: { unitId: true, tenant: true },
    });
    const tenantByUnit = new Map(activeContracts.map((c) => [c.unitId, c.tenant]));

    const activeReservations = await tx.reservation.findMany({ where: { status: 'ACTIVE' }, select: { unitId: true, name: true } });
    const reservationByUnit = new Map(activeReservations.map((r) => [r.unitId, r.name]));

    return units.map((u) => {
      const tenant = tenantByUnit.get(u.id) ?? null;
      const reservedBy = reservationByUnit.get(u.id) ?? null;
      const status: UnitStatus = u.underMaintenance ? 'maintenance' : tenant ? 'rented' : reservedBy ? 'reserved' : 'vacant';
      return { ...u, status, currentTenant: tenant, reservedBy: status === 'reserved' ? reservedBy : null };
    });
  }
}
