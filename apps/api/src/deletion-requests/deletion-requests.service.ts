import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CompaniesService } from '../companies/companies.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { MSG } from '../common/i18n/messages';

/**
 * Account deletion, the SaaS way (owner's rule, 2026-08-07): the merchant never
 * wipes its own database. It **files a request**; the platform's support
 * reviews it and is the one who executes. The request row is the audit trail of
 * that decision, so it lives on the platform side and survives review.
 *
 * Merchant-side methods run in the tenant context (isolated like everything
 * else). Support-side methods run unscoped on purpose — reviewing requests is a
 * cross-tenant platform job, same pattern as the companies list.
 */
@Injectable()
export class DeletionRequestsService {
  private readonly logger = new Logger(DeletionRequestsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly companiesService: CompaniesService,
  ) {}

  // ---------- Merchant side ----------

  /** Only the company owner may ask for the company to be deleted. */
  private assertOwner(actorType: string): void {
    if (actorType !== 'COMPANY') throw new ForbiddenException(MSG.deletion_owner_only);
  }

  /** The merchant's own view: its current (or last) request, if any. */
  myRequest(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.accountDeletionRequest.findFirst({ orderBy: { createdAt: 'desc' } }),
    );
  }

  submit(companyId: string, actorType: string, reason?: string) {
    this.assertOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // One open request at a time — a second "please delete us" adds nothing
      // but confusion about which one support is acting on.
      const open = await tx.accountDeletionRequest.findFirst({ where: { status: 'PENDING' } });
      if (open) throw new ConflictException(MSG.deletion_already_pending);
      return tx.accountDeletionRequest.create({
        data: { reason: reason?.trim() || null } as unknown as Prisma.AccountDeletionRequestUncheckedCreateInput,
      });
    });
  }

  /** A merchant can withdraw its own request while support hasn't acted. */
  cancel(companyId: string, actorType: string, id: string) {
    this.assertOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.accountDeletionRequest.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.deletion_request_not_found);
      if (existing.status !== 'PENDING') throw new ConflictException(MSG.deletion_not_pending);
      return tx.accountDeletionRequest.update({ where: { id }, data: { status: 'CANCELLED', decidedAt: new Date() } });
    });
  }

  // ---------- Support (platform admin) side ----------

  /** Every request across tenants, pending first — support's worklist. */
  listAll() {
    return this.prisma.accountDeletionRequest.findMany({
      include: { company: { select: { id: true, orgName: true, status: true, subEnd: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async reject(id: string, note?: string) {
    const existing = await this.prisma.accountDeletionRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(MSG.deletion_request_not_found);
    if (existing.status !== 'PENDING') throw new ConflictException(MSG.deletion_not_pending);
    return this.prisma.accountDeletionRequest.update({
      where: { id },
      data: { status: 'REJECTED', decidedAt: new Date(), decidedNote: note?.trim() || null },
    });
  }

  /**
   * Approves AND executes: the company and everything under it is deleted via
   * the same cascade the developer panel uses. The request row itself would go
   * with the company (FK cascade), so it is marked APPROVED first and kept by
   * detaching is impossible — instead we log the execution; the platform's own
   * records (this log) are the durable trace.
   */
  async approveAndExecute(id: string, note?: string) {
    const existing = await this.prisma.accountDeletionRequest.findUnique({
      where: { id },
      include: { company: { select: { id: true, orgName: true } } },
    });
    if (!existing) throw new NotFoundException(MSG.deletion_request_not_found);
    if (existing.status !== 'PENDING') throw new ConflictException(MSG.deletion_not_pending);

    await this.prisma.accountDeletionRequest.update({
      where: { id },
      data: { status: 'APPROVED', decidedAt: new Date(), decidedNote: note?.trim() || null },
    });

    this.logger.warn(`Executing account deletion for company ${existing.company.id} ("${existing.company.orgName}") — approved request ${id}`);
    await this.companiesService.remove(existing.company.id);
    return { executed: true, companyId: existing.company.id, orgName: existing.company.orgName };
  }
}
