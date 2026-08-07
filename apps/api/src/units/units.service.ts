import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Unit } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { expireStaleReservations } from '../reservations/reservations.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { formatMessage, MSG } from '../common/i18n/messages';

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

      return tx.unit.update({ where: { id }, data });
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
