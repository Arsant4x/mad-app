import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CompaniesService } from '../companies/companies.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { MSG } from '../common/i18n/messages';

/** من قرّر — مديرُ المنصّة الذي وافق أو رفض؛ يُكتب على القرار نفسه (`ق-٥٣٧`). */
export interface DecisionActor {
  id: string;
  username: string;
}

/**
 * Account deletion, the SaaS way (owner's rule, 2026-08-07): the merchant never
 * wipes its own database. It **files a request**; the platform's support
 * reviews it and is the one who executes. The request row is the audit trail of
 * that decision, so it lives on the platform side and survives review.
 *
 * Merchant-side methods run in the tenant context (isolated like everything
 * else). Support-side methods run unscoped on purpose — reviewing requests is a
 * cross-tenant platform job, same pattern as the companies list.
 *
 * ⚠️ **ولا مفتاحَ أجنبيّ إلى المنشأة** (`ق-٥٣٧`): الطلبُ وقرارُه يبقيان بعد حذفها —
 * فالاسمُ يُحفظ على الطلب عند تقديمه، **ومن قرّر يُكتب على القرار**. **حدُّه المعلَن**:
 * طلبٌ معلّقٌ لمنشأةٍ زالت من مسارٍ آخر (`DELETE /companies/:id`) يبقى معلّقاً،
 * وتنفيذُه يُرفض `404` — **ومخرجُه الرفضُ بملاحظة**.
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
      // الاسمُ يُحفظ على الطلب وقتَ تقديمه — فصفُّ المنشأة يزول مع التنفيذ (`ق-٥٣٧`)؛ و`companies` بلا RLS.
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { orgName: true } });
      return tx.accountDeletionRequest.create({
        data: { reason: reason?.trim() || null, companyName: company.orgName } as unknown as Prisma.AccountDeletionRequestUncheckedCreateInput,
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

  /**
   * Every request across tenants, pending first — support's worklist.
   * الاسمُ على الصفّ نفسه لا في ضمّة — فالمنشأةُ قد تكون زالت (`ق-٥٣٧`).
   */
  listAll() {
    return this.prisma.accountDeletionRequest.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async reject(id: string, note: string | undefined, decider: DecisionActor) {
    const existing = await this.prisma.accountDeletionRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(MSG.deletion_request_not_found);
    if (existing.status !== 'PENDING') throw new ConflictException(MSG.deletion_not_pending);
    return this.prisma.accountDeletionRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        decidedAt: new Date(),
        decidedNote: note?.trim() || null,
        decidedById: decider.id,
        decidedByName: decider.username,
      },
    });
  }

  /**
   * Approves AND executes: the company and everything under it is deleted via
   * the same cascade the developer panel uses. **والصفُّ يبقى** (`ق-٥٣٧`) — بلا
   * مفتاحٍ أجنبيّ إلى المنشأة، حاملاً اسمَها ومن قرّر ومتى وبأيّ ملاحظة: **هو الأثرُ
   * الدائم على قرار الإعدام**، وسطرُ سجلّ الخادم تكملةٌ لا بديل.
   */
  async approveAndExecute(id: string, note: string | undefined, decider: DecisionActor) {
    const existing = await this.prisma.accountDeletionRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(MSG.deletion_request_not_found);
    if (existing.status !== 'PENDING') throw new ConflictException(MSG.deletion_not_pending);
    // المنشأةُ تُقرأ بمعرّفها لا بضمّة — فقد تكون زالت من مسارٍ آخر، وعندها لا تنفيذَ (الحدُّ المعلَن أعلاه).
    const company = await this.prisma.company.findUnique({ where: { id: existing.companyId }, select: { id: true, orgName: true } });
    if (!company) throw new NotFoundException(MSG.company_not_found);

    this.logger.warn(`Executing account deletion for company ${company.id} ("${company.orgName}") — approved request ${id} by ${decider.username}`);
    // الوسمُ والتنفيذُ في معاملةٍ واحدة (`ق-٥٤١`): يسقطان معاً أو ينجحان معاً — فلا «مُوافَق»
    // على منشأةٍ حيّة. كان الوسمُ يسبق التنفيذَ، فإذا رفضت القاعدةُ الحذفَ بقي الطلبُ
    // «مُوافَقاً» والمنشأةُ حيّة: لا إعادةَ ولا سحبَ، والتاجرُ يقرأ «نُفِّذ» كذباً (`ق-٥٣٨`).
    await this.prisma.$transaction(
      async (tx) => {
        await tx.accountDeletionRequest.update({
          where: { id },
          data: {
            status: 'APPROVED',
            decidedAt: new Date(),
            decidedNote: note?.trim() || null,
            decidedById: decider.id,
            decidedByName: decider.username,
          },
        });
        await this.companiesService.remove(company.id, tx);
      },
      { timeout: 60_000 },
    );
    return { executed: true, companyId: company.id, orgName: company.orgName };
  }
}
