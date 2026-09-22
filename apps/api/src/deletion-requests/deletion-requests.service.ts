import { ConflictException, ForbiddenException, GoneException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CompaniesService } from '../companies/companies.service';
import { CompanyMovementService, retentionDeadline } from '../companies/company-movement.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { ARCHIVE_WINDOW_DAYS, ArchiveManifest, CompanyArchiveService } from '../export/company-archive.service';
import { PrismaService } from '../prisma/prisma.service';
import { formatMessage, MSG } from '../common/i18n/messages';
import { PersonalDataErasureService } from './personal-data-erasure.service';
import { reopenUntil } from '../common/tenant/reopen-window';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { listItems, pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — اسمُ المنشأة على الصفّ نفسِه (فقد تكون زالت) وسببُ الطلب وملاحظةُ القرار. */
const DELETION_REQUEST_SEARCH_FIELDS = ['companyName', 'reason', 'decidedNote'] as const;

/** من قرّر — مديرُ المنصّة الذي وافق أو رفض؛ يُكتب على القرار نفسه (`ق-٥٣٧`). */
export interface DecisionActor {
  id: string;
  username: string;
}

/** ما يراه مديرُ المنصّة قبل الموافقة — **الحقيقةُ قبل الضغطة**: أتُحذف أم تُغلَق، ولماذا. */
export interface DecisionPreview {
  outcome: 'DELETE' | 'CLOSE';
  movement: string[];
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
 * فالاسمُ يُحفظ على الطلب عند تقديمه، **ومن قرّر يُكتب على القرار**.
 *
 * **والموافقةُ تقيس ثم تقرّر** (`ق-٥٤٢` · `ق-٥٤٦`): منشأةٌ **بلا حركة** تُحذف صلباً؛
 * **وذاتُ حركة تُغلَق**: الدخولُ يُقطع والبياناتُ تبقى بأجل حفظٍ أدنى يُقرأ للتاجر
 * (`ق-٥٤٧`). **وإعادةُ الفتح بطلبٍ من التاجر وقرارٍ مسجَّل** بالمسار نفسِه (`ق-٥٤٨`).
 *
 * **حدُّه المعلَن**: طلبٌ معلّقٌ لمنشأةٍ زالت من مسارٍ آخر يبقى معلّقاً وتنفيذُه يُرفض
 * `404` — ومخرجُه الرفضُ بملاحظة. (ولم يبقَ مسارٌ آخر للحذف بعد `ق-٥٤٨`.)
 */
@Injectable()
export class DeletionRequestsService {
  private readonly logger = new Logger(DeletionRequestsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly companiesService: CompaniesService,
    private readonly movement: CompanyMovementService,
    private readonly archive: CompanyArchiveService,
    private readonly erasure: PersonalDataErasureService,
  ) {}

  // ---------- Merchant side ----------

  /** Only the company owner may ask for the company to be deleted — or reopened. */
  private assertOwner(actorType: string): void {
    if (actorType !== 'COMPANY') throw new ForbiddenException(MSG.deletion_owner_only);
  }

  /** The merchant's own view: its current (or last) request of any kind, if any. */
  myRequest(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.accountDeletionRequest.findFirst({ orderBy: { createdAt: 'desc' } }),
    );
  }

  /**
   * حالُ الحساب للتاجر — يُقرأ وهو مغلق (`ق-٥٤٧`): متى أُغلق، وحتى متى يبقى أثرُه على الأقلّ،
   * **وحتى متى تُقبل العودة** (`ق-٥٥٩`)، وهل مُحي غيرُ الملزِم.
   */
  async account(companyId: string) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { status: true, closedAt: true, retainUntil: true, erasedAt: true },
    });
    return { ...company, reopenUntil: company.closedAt ? reopenUntil(company.closedAt) : null };
  }

  /**
   * نسخةُ الإغلاق للتاجر (`ق-٥٥٤`): روابطُ تنزيلٍ موقَّعة لملفّاتها ما دام الأجلُ لم ينقضِ.
   * تُقرأ من آخر طلبٍ حُسم بالإغلاق — فالنسخةُ على الطلب نفسِه، وتبقى بعده.
   */
  async closureArchive(companyId: string, actorType: string) {
    this.assertOwner(actorType);
    const latest = await this.prisma.accountDeletionRequest.findFirst({
      where: { companyId, archiveProducedAt: { not: null } },
      orderBy: { archiveProducedAt: 'desc' },
    });
    if (!latest?.archiveManifest || !latest.archiveExpiresAt) throw new NotFoundException(MSG.archive_not_ready);
    if (latest.archiveExpiresAt < new Date()) throw new GoneException(MSG.archive_expired);
    const manifest = latest.archiveManifest as unknown as ArchiveManifest;
    return {
      producedAt: manifest.producedAt,
      expiresAt: manifest.expiresAt,
      years: manifest.years,
      totalRows: manifest.totalRows,
      stampedInvoices: manifest.stampedInvoices,
      files: await this.archive.links(manifest),
    };
  }

  submit(companyId: string, actorType: string, reason?: string) {
    this.assertOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // الاسمُ يُحفظ على الطلب وقتَ تقديمه — فصفُّ المنشأة يزول مع التنفيذ (`ق-٥٣٧`)؛ و`companies` بلا RLS.
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { orgName: true, status: true } });
      if (company.status === 'CLOSED') throw new ConflictException(MSG.deletion_company_closed);
      // One open request at a time — a second "please delete us" adds nothing
      // but confusion about which one support is acting on.
      const open = await tx.accountDeletionRequest.findFirst({ where: { status: 'PENDING' } });
      if (open) throw new ConflictException(MSG.deletion_already_pending);
      return tx.accountDeletionRequest.create({
        data: { reason: reason?.trim() || null, companyName: company.orgName, kind: 'DELETION' } as unknown as Prisma.AccountDeletionRequestUncheckedCreateInput,
      });
    });
  }

  /**
   * طلبُ إعادة الفتح (`ق-٥٤٨`): لحسابٍ مغلقٍ فقط، بالمسار نفسِه والأثر نفسِه — ومن قرّر يُكتب على القرار.
   * **وللنافذة أجل** (`ق-٥٥٩`): بعده يكون غيرُ الملزِم قد مُحي، فلا عودةَ — والرفضُ يسمّي الأجل.
   */
  requestReopening(companyId: string, actorType: string) {
    this.assertOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { orgName: true, status: true, closedAt: true, erasedAt: true } });
      if (company.status !== 'CLOSED') throw new ConflictException(MSG.reopen_not_closed);
      this.assertReopenWindowOpen(company);
      const open = await tx.accountDeletionRequest.findFirst({ where: { status: 'PENDING' } });
      if (open) throw new ConflictException(MSG.deletion_already_pending);
      return tx.accountDeletionRequest.create({
        data: { reason: null, companyName: company.orgName, kind: 'REOPENING' } as unknown as Prisma.AccountDeletionRequestUncheckedCreateInput,
      });
    });
  }

  /** نافذةُ العودة تُغلق بانقضاء أجلها **أو بمحو غير الملزِم** — أيّهما وقع أولاً؛ فما مُحي لا يعود. */
  private assertReopenWindowOpen(company: { closedAt: Date | null; erasedAt: Date | null }): void {
    const deadline = company.closedAt ? reopenUntil(company.closedAt) : null;
    if (company.erasedAt || (deadline && deadline < new Date())) {
      throw new ConflictException(formatMessage(MSG.reopen_window_closed, { reopenUntil: (deadline ?? company.erasedAt!).toISOString().slice(0, 10) }));
    }
  }

  /**
   * طلبُ إتلافٍ صريح (`ق-٥٥٩/ب` — م٤/٥): صاحبُ الحساب المغلق يطلب محوَ غير الملزِم **الآن** لا بعد
   * النافذة. يُقرَّر بالمسار نفسِه ومن قرّر يُكتب — **ويُغلق نافذةَ العودة بتنفيذه**، فيُقال ذلك قبل الطلب.
   */
  requestErasure(companyId: string, actorType: string) {
    this.assertOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { orgName: true, status: true, erasedAt: true } });
      if (company.status !== 'CLOSED') throw new ConflictException(MSG.erasure_only_closed);
      if (company.erasedAt) throw new ConflictException(MSG.erasure_already_done);
      const open = await tx.accountDeletionRequest.findFirst({ where: { status: 'PENDING' } });
      if (open) throw new ConflictException(MSG.deletion_already_pending);
      return tx.accountDeletionRequest.create({
        data: { reason: null, companyName: company.orgName, kind: 'ERASURE' } as unknown as Prisma.AccountDeletionRequestUncheckedCreateInput,
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
   * **ومعاينةُ القرار على كل طلب حذفٍ معلَّق**: أتُحذف أم تُغلَق، ولماذا — قبل الضغطة.
   */
  async listAll(query?: PagedQueryDto) {
    const where: Prisma.AccountDeletionRequestWhereInput = { ...searchWhere(searchTerm(query), DELETION_REQUEST_SEARCH_FIELDS) };
    const result = await pagedFindMany(query, this.prisma.accountDeletionRequest, {
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    // المعاينةُ تُحسب للصفوف المُعادة وحدَها (القائمةُ كلُّها أو الصفحة) — فهي قياسٌ تحت سياق كل منشأة.
    const withPreview = await Promise.all(
      listItems(result).map(async (row) => {
        if (row.status !== 'PENDING' || row.kind !== 'DELETION') return row;
        const company = await this.prisma.company.findUnique({ where: { id: row.companyId }, select: { id: true } });
        return company ? { ...row, preview: await this.preview(row.companyId) } : row;
      }),
    );
    return Array.isArray(result) ? withPreview : { ...result, items: withPreview };
  }

  /** الحقيقةُ قبل الضغطة (`ق-٥٤٦`): يُقاس الأثرُ تحت سياق المنشأة. */
  async preview(companyId: string): Promise<DecisionPreview> {
    const report = await this.movement.describe(companyId);
    return { outcome: report.hasMovement ? 'CLOSE' : 'DELETE', movement: report.labels };
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
   * Approves AND executes — **يقيس ثم يقرّر** (`ق-٥٤٢`):
   * - طلبُ إعادة فتح ⟵ الحسابُ يعود نشطاً (ودورةُ الاشتراك تُقيَّم في طلبه التالي).
   * - طلبُ حذفٍ لمنشأةٍ **بلا حركة** ⟵ حذفٌ صلبٌ عبر المسلك الواحد.
   * - طلبُ حذفٍ لمنشأةٍ **لها حركة** ⟵ إغلاق: `CLOSED` · `closedAt` · `retainUntil`.
   *
   * **والوسمُ والتنفيذُ في معاملةٍ واحدة** (`ق-٥٤١`) — يسقطان معاً أو ينجحان معاً. **والصفُّ
   * يبقى** (`ق-٥٣٧`) حاملاً ما وقع (`outcome`) والحركةَ التي أوجبت الإغلاقَ ومن قرّر.
   */
  async approveAndExecute(id: string, note: string | undefined, decider: DecisionActor) {
    const existing = await this.prisma.accountDeletionRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(MSG.deletion_request_not_found);
    if (existing.status !== 'PENDING') throw new ConflictException(MSG.deletion_not_pending);
    // المنشأةُ تُقرأ بمعرّفها لا بضمّة — فقد تكون زالت، وعندها لا تنفيذَ (الحدُّ المعلَن أعلاه).
    const company = await this.prisma.company.findUnique({
      where: { id: existing.companyId },
      select: { id: true, orgName: true, status: true, closedAt: true, retainUntil: true, erasedAt: true },
    });
    if (!company) throw new NotFoundException(MSG.company_not_found);

    const decision = {
      status: 'APPROVED' as const,
      decidedAt: new Date(),
      decidedNote: note?.trim() || null,
      decidedById: decider.id,
      decidedByName: decider.username,
    };

    if (existing.kind === 'REOPENING') {
      if (company.status !== 'CLOSED') throw new ConflictException(MSG.reopen_not_closed);
      // النافذةُ تُقرأ عند القرار أيضاً: طلبٌ قُدِّم قبل الأجل وقُرِّر بعده — أو بعد المحو — لا يُعيد ما مُحي.
      this.assertReopenWindowOpen(company);
      this.logger.warn(`Reopening company ${company.id} ("${company.orgName}") — approved request ${id} by ${decider.username}`);
      await this.prisma.$transaction([
        this.prisma.accountDeletionRequest.update({ where: { id }, data: { ...decision, outcome: 'REOPENED' } }),
        this.prisma.company.update({ where: { id: company.id }, data: { status: 'ACTIVE', closedAt: null, retainUntil: null } }),
      ]);
      return { executed: true, outcome: 'REOPENED' as const, companyId: company.id, orgName: company.orgName, movement: [] as string[], retainUntil: null };
    }

    if (existing.kind === 'ERASURE') {
      if (company.status !== 'CLOSED') throw new ConflictException(MSG.erasure_only_closed);
      if (company.erasedAt) throw new ConflictException(MSG.erasure_already_done);
      // الوسمُ بعد التنفيذ لا قبله (`ق-٥٤١`): إن سقط المحوُ بقي الطلبُ معلّقاً — ولا «مُوافَقٌ» كاذب.
      const report = await this.erasure.erase(company.id, decider, 'REQUEST');
      await this.prisma.accountDeletionRequest.update({ where: { id }, data: { ...decision, outcome: 'ERASED' } });
      this.logger.warn(`Erased non-mandatory data of company ${company.id} ("${company.orgName}") — approved request ${id} by ${decider.username}`);
      // الحدُّ يُعلَن في الردّ نفسِه (`ق-١٢٧٨`/②): ما لا يبلغه المحو يُقال لطالبه لا يُكتشف بعده.
      return { executed: true, outcome: 'ERASED' as const, companyId: company.id, orgName: company.orgName, movement: [] as string[], retainUntil: company.retainUntil, erased: report.counts, limits: report.limits };
    }

    const report = await this.movement.describe(company.id);
    const closedAt = decision.decidedAt;
    // ذاتُ الحركة تبقى بمدد الحفظ (`ق-٥٤٧`)؛ وبلا حركةٍ تبقى نافذةَ النسخة فقط — ثم يُمحى
    // في الطبقة الثالثة (`ق-٥٥٦`) لا هنا: **الحذفُ الفوريُّ عند الموافقة محوٌ قبل أن ينال
    // صاحبُه نسختَه** (`ق-٥٥٤`)، فأُرجئ إلى انقضاء الأجل.
    const retainUntil = report.hasMovement ? retentionDeadline(closedAt, report.models) : new Date(closedAt.getTime() + ARCHIVE_WINDOW_DAYS * 24 * 3600 * 1000);
    // مدّةُ الإتاحة = مدّةُ الحفظ (`ق-٥٥٨/ج`): ما دمنا نحفظ يصل التاجرُ نسختَه — فقطعُ وصوله قبل
    // انقضاء التزامه يتركه مسؤولاً عمّا لا يبلغه. وبلا حركةٍ النافذةُ هي الأجل نفسُه.
    const archiveExpiresAt = retainUntil;

    // ① النسخةُ أولاً — ولا يسبقها شيء: إن سقط إنتاجُها سقطت الموافقةُ قبل أن تمسّ الحساب.
    const manifest = await this.archive.produce(company.id, decider, archiveExpiresAt);

    this.logger.warn(
      `Closing company ${company.id} ("${company.orgName}") — movement: ${report.labels.join(', ') || 'none'} — archive ${manifest.files.length} files — approved request ${id} by ${decider.username}`,
    );
    await this.prisma.$transaction([
      this.prisma.accountDeletionRequest.update({
        where: { id },
        data: {
          ...decision,
          outcome: 'CLOSED',
          movement: report.labels,
          archiveManifest: manifest as unknown as Prisma.InputJsonValue,
          archiveProducedAt: new Date(manifest.producedAt),
          archiveExpiresAt,
        },
      }),
      this.prisma.company.update({ where: { id: company.id }, data: { status: 'CLOSED', closedAt, retainUntil } }),
    ]);
    return {
      executed: true,
      outcome: 'CLOSED' as const,
      companyId: company.id,
      orgName: company.orgName,
      movement: report.labels,
      retainUntil,
      archive: { files: manifest.files.length, years: manifest.years, expiresAt: archiveExpiresAt },
    };
  }
}
