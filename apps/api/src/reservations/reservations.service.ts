import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

const RESERVATION_INCLUDE = { unit: { include: { property: true } } };

@Injectable()
export class ReservationsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await expireStaleReservations(tx);
      return tx.reservation.findMany({ include: RESERVATION_INCLUDE, orderBy: { createdAt: 'desc' } });
    });
  }

  create(companyId: string, dto: CreateReservationDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const unit = await tx.unit.findUnique({ where: { id: dto.unitId } });
      if (!unit) throw new NotFoundException('الوحدة غير موجودة');

      const today = new Date();
      const currentContract = await tx.contract.findFirst({
        where: { unitId: dto.unitId, status: { not: 'CANCELLED' }, start: { lte: today }, end: { gte: today } },
      });
      if (currentContract) throw new ConflictException('هذه الوحدة مؤجَّرة حالياً بعقد سارٍ — لا يمكن حجزها');

      await expireStaleReservations(tx);
      const existing = await activeReservationForUnit(tx, dto.unitId);
      if (existing) {
        throw new ConflictException(`يوجد حجز نشط على هذه الوحدة بالفعل حتى ${existing.expiryDate.toISOString().slice(0, 10)}`);
      }

      const created = await tx.reservation.create({
        data: {
          unitId: dto.unitId,
          name: dto.name,
          phone: dto.phone,
          deposit: dto.deposit ?? 0,
          expiryDate: new Date(dto.expiryDate),
          status: 'ACTIVE',
        } as unknown as Prisma.ReservationUncheckedCreateInput,
      });

      return tx.reservation.findUniqueOrThrow({ where: { id: created.id }, include: RESERVATION_INCLUDE });
    });
  }

  cancel(companyId: string, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.reservation.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('الحجز غير موجود');
      return tx.reservation.update({ where: { id }, data: { status: 'EXPIRED' }, include: RESERVATION_INCLUDE });
    });
  }
}

/** Matches the mockup's `expireOldReservations` — flips any ACTIVE reservation
 * whose expiry date has passed, called lazily on every read/write rather than
 * via a background job (same pattern as ContractsService.refreshInstallmentStatuses). */
export async function expireStaleReservations(tx: Prisma.TransactionClient): Promise<void> {
  await tx.reservation.updateMany({
    where: { status: 'ACTIVE', expiryDate: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
}

/** Matches the mockup's `unitActiveReservation` (post-expiry). Exported so
 * ContractsService can check/convert reservations when creating a contract. */
export async function activeReservationForUnit(tx: Prisma.TransactionClient, unitId: string) {
  return tx.reservation.findFirst({ where: { unitId, status: 'ACTIVE' } });
}
