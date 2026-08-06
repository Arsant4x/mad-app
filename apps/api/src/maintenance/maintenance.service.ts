import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MaintenanceStatus, Prisma } from '@prisma/client';
import { toBaseAmount } from '../common/currency/base-amount.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { postMaintenanceCostEntry } from '../journal/auto-posting.util';
import { coverForTx } from '../warranties/warranties.service';
import {
  AssignMaintenanceDto,
  CancelMaintenanceDto,
  CloseMaintenanceDto,
  CompleteMaintenanceDto,
  CreateMaintenanceDto,
  StartMaintenanceDto,
  UpdateMaintenanceDto,
} from './dto/maintenance.dto';

const REQUEST_INCLUDE = {
  property: { select: { id: true, name: true } },
  unit: { select: { id: true, unitNo: true } },
};

/**
 * What each status may become.
 *
 * Written as data rather than scattered `if`s so the whole lifecycle is legible
 * in one place — and so an illegal jump (reporting straight to CLOSED, skipping
 * the work) is impossible by construction rather than by remembering to check.
 */
const ALLOWED_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  REPORTED: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['DONE', 'CANCELLED'],
  // Reopening a finished job is a new request, not a rewind: the cost is
  // already posted and the history has to stay legible.
  DONE: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  REPORTED: 'بلاغ جديد',
  ASSIGNED: 'مُسنَد',
  IN_PROGRESS: 'قيد التنفيذ',
  DONE: 'منجز',
  CLOSED: 'مغلق',
  CANCELLED: 'ملغى',
};

@Injectable()
export class MaintenanceService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.maintenanceRequest.findMany({
        include: REQUEST_INCLUDE,
        // Urgent first, then newest: the list is a work queue, not an archive.
        orderBy: [{ priority: 'asc' }, { reportedAt: 'desc' }],
      }),
    );
  }

  /**
   * One request, together with **what was under warranty when the fault was
   * reported**.
   *
   * The cover is computed against `reportedAt`, not today: a fault reported
   * while cover was live stays claimable even if it is opened here weeks
   * later. This is the whole reason warranties are recorded — a landlord who
   * finds out afterwards has already paid the contractor.
   */
  findOne(companyId: string, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const found = await tx.maintenanceRequest.findUnique({
        where: { id },
        include: { ...REQUEST_INCLUDE, warranty: { include: { supplier: { select: { id: true, name: true } } } } },
      });
      if (!found) throw new NotFoundException(MSG.maintenance_not_found);

      const availableCover = await coverForTx(tx, found.propertyId, found.unitId ?? undefined, found.reportedAt);
      return { ...found, availableCover };
    });
  }

  create(companyId: string, dto: CreateMaintenanceDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const property = await tx.property.findUnique({ where: { id: dto.propertyId } });
      if (!property) throw new NotFoundException(MSG.property_not_found);

      if (dto.unitId) {
        const unit = await tx.unit.findUnique({ where: { id: dto.unitId } });
        // A unit from a different property would put the request on a building
        // nobody is looking at.
        if (!unit || unit.propertyId !== dto.propertyId) throw new BadRequestException(MSG.unit_not_in_property);
      }

      const created = await tx.maintenanceRequest.create({
        data: {
          propertyId: dto.propertyId,
          unitId: dto.unitId ?? null,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          priority: dto.priority ?? 'NORMAL',
          reportedBy: dto.reportedBy?.trim() || null,
          reportedAt: new Date(dto.reportedAt),
        } as unknown as Prisma.MaintenanceRequestUncheckedCreateInput,
      });

      return tx.maintenanceRequest.findUniqueOrThrow({ where: { id: created.id }, include: REQUEST_INCLUDE });
    });
  }

  /** Details stay editable until the job is finished — a tenant calling back
   * with more information is normal, and a closed job's record is not. */
  update(companyId: string, id: string, dto: UpdateMaintenanceDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await this.load(tx, id);
      if (existing.status === 'CLOSED' || existing.status === 'CANCELLED') {
        throw new ConflictException(formatMessage(MSG.maintenance_status_final, { status: STATUS_LABEL[existing.status] }));
      }

      return tx.maintenanceRequest.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.reportedBy !== undefined ? { reportedBy: dto.reportedBy.trim() || null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
        },
        include: REQUEST_INCLUDE,
      });
    });
  }

  assign(companyId: string, id: string, dto: AssignMaintenanceDto) {
    return this.transition(companyId, id, 'ASSIGNED', { assignedTo: dto.assignedTo.trim() });
  }

  start(companyId: string, id: string, dto: StartMaintenanceDto) {
    return this.transition(companyId, id, 'IN_PROGRESS', { startedAt: new Date(dto.startedAt) });
  }

  /**
   * Marks the work finished and posts what it cost.
   *
   * The cost lands here rather than at report time because that is the first
   * moment it is actually known — and a request that ends up cancelled should
   * never have touched the ledger at all.
   */
  complete(companyId: string, id: string, dto: CompleteMaintenanceDto) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const existing = await this.load(tx, id, { property: true });
        this.assertTransition(existing.status, 'DONE');

        const exchangeRate = dto.exchangeRate ?? 1;
        const baseCost = dto.cost != null ? toBaseAmount(dto.cost, exchangeRate) : null;

        const journalEntry =
          baseCost != null
            ? await postMaintenanceCostEntry(tx, companyId, {
                title: existing.title,
                propertyName: existing.property.name,
                date: new Date(dto.completedAt),
                baseAmount: baseCost,
              })
            : null;

        return tx.maintenanceRequest.update({
          where: { id },
          data: {
            status: 'DONE',
            completedAt: new Date(dto.completedAt),
            ...(dto.cost != null
              ? { cost: dto.cost, currency: dto.currency?.trim() || 'SAR', exchangeRate, baseCost, journalEntryId: journalEntry?.id ?? null }
              : {}),
            ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
          },
          include: REQUEST_INCLUDE,
        });
      }),
    );
  }

  close(companyId: string, id: string, dto: CloseMaintenanceDto) {
    return this.transition(companyId, id, 'CLOSED', { closedAt: new Date(dto.closedAt) });
  }

  cancel(companyId: string, id: string, dto: CancelMaintenanceDto) {
    return this.transition(companyId, id, 'CANCELLED', { cancelReason: dto.cancelReason.trim() });
  }

  /**
   * Records that this job is being claimed under a warranty — or clears the
   * claim when the provider refuses cover.
   *
   * Kept separate from `update` because it is a different kind of fact: the
   * others describe the fault, this one describes who is expected to pay for
   * it. Allowed after completion too, since cover is often argued about long
   * after the work is done.
   */
  claim(companyId: string, id: string, warrantyId: string | null) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await this.load(tx, id);

      if (warrantyId) {
        const warranty = await tx.warranty.findUnique({ where: { id: warrantyId } });
        if (!warranty) throw new NotFoundException(MSG.warranty_not_found);

        // Checked rather than trusted: a claim recorded against cover that
        // never applied is worse than no record — it is a defence that
        // collapses the moment the provider looks at the dates.
        const covers =
          warranty.propertyId === existing.propertyId &&
          (warranty.unitId === null || warranty.unitId === existing.unitId) &&
          warranty.startDate <= existing.reportedAt &&
          warranty.endDate >= existing.reportedAt;
        if (!covers) throw new BadRequestException(MSG.warranty_not_covering);
      }

      return tx.maintenanceRequest.update({ where: { id }, data: { warrantyId }, include: REQUEST_INCLUDE });
    });
  }

  private transition(companyId: string, id: string, next: MaintenanceStatus, data: Prisma.MaintenanceRequestUncheckedUpdateInput) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await this.load(tx, id);
      this.assertTransition(existing.status, next);

      return tx.maintenanceRequest.update({ where: { id }, data: { status: next, ...data }, include: REQUEST_INCLUDE });
    });
  }

  /** Names both ends of the illegal move, so the user can see what they tried
   * to do rather than just being told "no". */
  private assertTransition(from: MaintenanceStatus, to: MaintenanceStatus): void {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new ConflictException(formatMessage(MSG.maintenance_invalid_transition, { from: STATUS_LABEL[from], to: STATUS_LABEL[to] }));
    }
  }

  private async load(tx: Prisma.TransactionClient, id: string, include?: { property: true }) {
    const found = await tx.maintenanceRequest.findUnique({ where: { id }, include });
    if (!found) throw new NotFoundException(MSG.maintenance_not_found);
    return found as typeof found & { property: { name: string } };
  }
}
