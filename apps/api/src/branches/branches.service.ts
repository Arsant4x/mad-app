import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatMessage, MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

const BRANCH_INCLUDE = { activity: true, property: true, warehouse: true } as const;

/** Creating and reshaping branches is an owner-level act — an employee working
 * inside a branch must not be able to invent new ones or move themselves into
 * another. Same pattern as CompanyUsersService/CompanyProfileService. */
function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') {
    throw new ForbiddenException(MSG.branch_forbidden);
  }
}

@Injectable()
export class BranchesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** An employee sees only the branches assigned to them; the owner sees all.
   * This is the list the branch picker on other screens is built from, so the
   * filter has to live here rather than in the UI. */
  list(companyId: string, allowedBranchIds: string[] | 'all') {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.branch.findMany({
        where: allowedBranchIds === 'all' ? {} : { id: { in: allowedBranchIds } },
        include: BRANCH_INCLUDE,
        orderBy: { name: 'asc' },
      }),
    );
  }

  create(companyId: string, actorType: string, dto: CreateBranchDto) {
    assertIsCompanyOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const activityId = await this.resolveActivityId(tx, dto.activityId);

      try {
        const created = await tx.branch.create({
          data: {
            name: dto.name.trim(),
            type: dto.type,
            activityId,
            propertyId: dto.propertyId,
            warehouseId: dto.warehouseId,
            hours: dto.hours,
          } as unknown as Prisma.BranchUncheckedCreateInput,
        });
        return tx.branch.findUniqueOrThrow({ where: { id: created.id }, include: BRANCH_INCLUDE });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(formatMessage(MSG.branch_name_taken, { name: dto.name.trim() }));
        }
        throw e;
      }
    });
  }

  update(companyId: string, actorType: string, id: string, dto: UpdateBranchDto) {
    assertIsCompanyOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.branch.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.branch_not_found);

      const data: Prisma.BranchUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.type !== undefined) data.type = dto.type;
      if (dto.hours !== undefined) data.hours = dto.hours;
      if (dto.propertyId !== undefined) data.propertyId = dto.propertyId || null;
      if (dto.warehouseId !== undefined) data.warehouseId = dto.warehouseId || null;
      if (dto.activityId !== undefined) data.activityId = await this.resolveActivityId(tx, dto.activityId);

      try {
        await tx.branch.update({ where: { id }, data });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(formatMessage(MSG.branch_name_taken, { name: dto.name!.trim() }));
        }
        throw e;
      }
      return tx.branch.findUniqueOrThrow({ where: { id }, include: BRANCH_INCLUDE });
    });
  }

  async remove(companyId: string, actorType: string, id: string): Promise<void> {
    assertIsCompanyOwner(actorType);
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.branch.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.branch_not_found);

      // Every branchId FK is ON DELETE SET NULL, so deleting would silently
      // orphan the branch's history into the company-wide bucket rather than
      // failing. Refuse instead — losing which branch earned what is exactly
      // the reporting the branch feature exists to provide.
      const [invoices, purchases, entries, movements] = await Promise.all([
        tx.invoice.count({ where: { branchId: id } }),
        tx.purchase.count({ where: { branchId: id } }),
        tx.journalEntry.count({ where: { branchId: id } }),
        tx.stockMovement.count({ where: { branchId: id } }),
      ]);
      if (invoices + purchases + entries + movements > 0) {
        throw new ConflictException(MSG.branch_has_data);
      }

      await tx.branch.delete({ where: { id } });
    });
  }

  /** Falls back to the company's default (first) activity when none is given,
   * which is what keeps activities invisible until a company actually runs
   * more than one line of business. */
  private async resolveActivityId(tx: Prisma.TransactionClient, activityId: string | undefined): Promise<string | null> {
    if (activityId) {
      const activity = await tx.businessActivity.findUnique({ where: { id: activityId } });
      if (!activity) throw new NotFoundException(MSG.activity_not_found);
      return activity.id;
    }
    const fallback = await tx.businessActivity.findFirst({ orderBy: { createdAt: 'asc' } });
    return fallback?.id ?? null;
  }
}
