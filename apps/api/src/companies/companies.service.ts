import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Company, Prisma } from '@mad-app/db';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { evaluateCompanyStatus } from '../common/tenant/company-status.util';
import { createCompanyAccount } from './create-company-account';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateCompanySubscriptionDto } from './dto/update-company-subscription.dto';
import { PlatformDecisionsService } from '../platform/platform-decisions.service';
import { formatMessage, MSG } from '../common/i18n/messages';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { listItems, listOrPage, searchTerm, searchWhere } from '../common/pagination/paged.util';

const COMPANY_INCLUDE = { permissionTemplate: true } as const;

/** حقولُ البحث المُعلَنة للوحة المنصّة (`ق-١٢٣٦`) — الاسمُ التجاريُّ والقانونيُّ والرقمُ الضريبيُّ والبريد. */
const COMPANY_SEARCH_FIELDS = ['orgName', 'legalName', 'vatNumber', 'email'] as const;

/**
 * أسماءُ السجلّات التي ترفض القاعدةُ حذفَ المنشأة لأجلها — **للرسالة لا للحكم**.
 * يُشتقّ اسمُ الجدول من اسم القيد الذي أبلغت به القاعدة (`<table>_companyId_fkey`)،
 * ويُترجَم المعروفُ منه؛ وما لم يُعرف يُعرَض باسمه الخام لا يُخفى.
 */
const RECORD_NAMES: Record<string, string> = {
  task_logs: 'سجلّ المهام',
  tasks: 'المهامّ',
  delegation_logs: 'سجلّ التفويض',
};

export function blockingRecordsFrom(fieldName: unknown): string {
  const match = /^([a-z_]+)_companyId_fkey/.exec(String(fieldName ?? ''));
  const table = match?.[1] ?? String(fieldName ?? 'unknown');
  return RECORD_NAMES[table] ?? table;
}

/**
 * Subscription start is anchored to the **actual** activation day and never
 * accepts an earlier date (owner's rule): a backdated start would grant a
 * shorter or already-lapsed subscription and muddy every grace-period
 * calculation. A missing value means "activate now"; a future value (scheduled
 * start) is allowed, an earlier one is refused.
 *
 * يومُ منطقة العملية بحقّه: الرفضُ هنا يقرؤه مديرُ المنصّة وحدَه عند تأريخ اشتراكٍ رجعياً — لا رقمٌ
 * يقرؤه التاجر ولا يبني عليه (قسمةُ المالك ② في `ق-١١٩٠`: يُعلَن بحجّته ولا يُصلَح). والأثرُ
 * الأقصى ثلاثُ ساعاتٍ عند حدّ اليوم على خادمٍ بتوقيت الرياض، في رفضٍ يُعاد بتاريخ اليوم.
 */
function resolveSubStart(dtoSubStart?: string): Date {
  if (!dtoSubStart) return new Date();
  const requested = new Date(dtoSubStart);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (requested < startOfToday) throw new BadRequestException(MSG.sub_start_no_backdate);
  return requested;
}

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly config: ConfigService,
    private readonly decisions: PlatformDecisionsService,
  ) {}

  /**
   * نفس مصدر `AuthService.register` — لا رقمٌ ثانٍ. مدة التجربة قرار تجاري
   * يُضبط من البيئة بلا نشر، وقناتان تقرآنه من موضعين تفترقان عند أول تغيير.
   */
  private trialDays(): number {
    return parseInt(this.config.get<string>('TRIAL_DAYS', '14'), 10);
  }

  async list(query?: PagedQueryDto) {
    const where: Prisma.CompanyWhereInput = { ...searchWhere(searchTerm(query), COMPANY_SEARCH_FIELDS) };
    // الترتيبُ التامّ (`ق-٣٥٦`): تاريخُ الإنشاء ثم `id` — فلا يتبدّل متعادلان بين صفحتين.
    const args = { where, include: COMPANY_INCLUDE, orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] };
    // `listOrPage` لا `pagedFindMany`: `refreshStatus` مُعمَّمٌ على الصفّ بضمائمه (`permissionTemplate`) فيُستنتج نوعُه من النداء.
    const result = await listOrPage(query, {
      all: () => this.prisma.company.findMany(args),
      count: () => this.prisma.company.count({ where }),
      window: (offset, limit) => this.prisma.company.findMany({ ...args, skip: offset, take: limit }),
    });
    // تقييمُ الحالة على الصفوف المُعادة وحدَها — القائمةُ كلُّها أو الصفحة.
    const refreshed = await Promise.all(listItems(result).map((c) => this.refreshStatus(c)));
    return Array.isArray(result) ? refreshed : { ...result, items: refreshed };
  }

  /** Matches the mockup's renderDeveloperPanel calling checkSubscriptionStatus
   * on every render — the panel must show a company as FROZEN/STOPPED as soon
   * as its subscription lapses, not only after that company's next login
   * (which is the only other place evaluateCompanyStatus normally runs). */
  private async refreshStatus<T extends Company>(company: T): Promise<T> {
    const evaluated = evaluateCompanyStatus(company);
    if (evaluated.status === company.status && evaluated.frozenAt?.getTime() === company.frozenAt?.getTime()) {
      return company;
    }
    // The update returns the same row with the same include, so it is a `T` —
    // but TypeScript can't prove that for an open generic, and the assertion
    // has to go through `unknown` now that Company carries enough fields for
    // the two shapes to no longer overlap structurally on their own.
    return this.prisma.company.update({
      where: { id: company.id },
      data: { status: evaluated.status, frozenAt: evaluated.frozenAt },
      include: COMPANY_INCLUDE,
    }) as unknown as Promise<T>;
  }

  /**
   * القالبُ الذي تركب عليه منشأة: **عامٌّ** (قالبُ منشأةٍ يحدّد موظّفيها لا المنشأةَ نفسَها) **وغيرُ نظاميّ**
   * (`ق-٦٤٤`: قالبُ «المطوّر» لا يركب عليه تاجر). ⚖️ توجيه ٢٧٥ (القاعدة ٣٧): كان هذا المسارُ يفحص «عامٌّ» وحدَه، فيقبل
   * قالبَ النظام في الإنشاء وفي التغيير، بعد أن أُغلق في التسجيل الذاتي وإسناد الموظّف.
   *
   * وقراءتُه **بمسنَد الإدارة** (المرحلة ③ · `ق-٦٧٥`): هذا مسارُ المنصّة. القالبُ العامُّ يُرى بلا سياقٍ بنصّ السياسة
   * أصلاً، لكن السياقَ يُسمّى لا يُترك للسياسة أن تسامحه.
   */
  private async assertCompanyTemplate(permissionTemplateId: string): Promise<void> {
    const template = await this.tenantPrisma.runAsPlatformAdmin((tx) =>
      tx.permissionTemplate.findUnique({ where: { id: permissionTemplateId }, select: { companyId: true, isSystem: true } }),
    );
    if (!template || template.companyId !== null) throw new NotFoundException(MSG.template_not_found);
    if (template.isSystem) throw new ForbiddenException(MSG.template_system_not_for_company);
  }

  async create(dto: CreateCompanyDto) {
    await this.assertCompanyTemplate(dto.permissionTemplateId);

    // الإنشاء في `createCompanyAccount` — نواة واحدة يتقاسمها هذا المسار ومسار
    // التسجيل الذاتي. وما يخصّ لوحة المدير وحدها يبقى هنا: التحقق من أن القالب
    // عامّ، وقبول تواريخ اشتراك يدوية.
    //
    // ⚠️ و`subEnd` يبقى اختيارياً في العقد — لكن النواة **تسقط على مدة التجربة**
    // عند غيابه بدل أن تُنتج منشأةً بلا تاريخ نهاية. الصفّ ذاك كان لا يتجمّد
    // أبداً (`evaluateCompanyStatus` يعيد الحالة كما هي حين يغيب `subEnd`) — أي
    // قناةُ إنشاءٍ خارج دورة الحياة كلها، وهو نقيض «نموذجٍ واحد».
    const { companyId } = await createCompanyAccount(this.prisma, {
      username: dto.username,
      password: dto.password,
      orgName: dto.orgName,
      // ق-١٣٦٨ — الدولةُ المعلَنة، وغيابُها يأخذ الإقليمَ الوحيد ما دام وحيداً.
      country: dto.country,
      permissionTemplateId: dto.permissionTemplateId,
      subStart: resolveSubStart(dto.subStart),
      subEnd: dto.subEnd ? new Date(dto.subEnd) : undefined,
      trialDays: this.trialDays(),
    });

    // تُقرأ بعد الالتزام بالـ`include` الذي تحتاجه اللوحة — النواة تعيد المعرّف
    // وحده عمداً لئلا يتفرّع توقيعها بحسب حاجة كل مستدعٍ.
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, include: COMPANY_INCLUDE });
  }

  async update(id: string, dto: UpdateCompanyDto) {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(MSG.company_not_found);

    if (dto.permissionTemplateId) await this.assertCompanyTemplate(dto.permissionTemplateId);

    if (dto.username) {
      const clash = await this.prisma.loginIdentity.findUnique({ where: { username: dto.username } });
      if (clash && clash.id !== existing.loginIdentityId) throw new ConflictException(formatMessage(MSG.username_taken, { username: dto.username }));
      await this.prisma.loginIdentity.update({ where: { id: existing.loginIdentityId }, data: { username: dto.username } });
    }
    if (dto.password) {
      await this.prisma.loginIdentity.update({ where: { id: existing.loginIdentityId }, data: { passwordHash: await argon2.hash(dto.password) } });
    }

    return this.prisma.company.update({
      where: { id },
      data: {
        orgName: dto.orgName,
        permissionTemplateId: dto.permissionTemplateId,
      },
      include: COMPANY_INCLUDE,
    });
  }

  /**
   * **تغييرُ الاشتراك — مسارٌ بدوره** (`ق-١٣١٧` · ⑪A2): الاشتراكُ مالٌ يُحصَّل ويُردّ،
   * **والتشغيلُ يخصّ الخادمَ والنسخ لا المال**. خرج من `update` إلى هنا **ليُحرَس بدورٍ آخر**
   * لا لتغيير سلوكه — والمنطقُ منقولٌ كما هو.
   */
  async updateSubscription(id: string, dto: UpdateCompanySubscriptionDto) {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(MSG.company_not_found);

    // 🔴 **بيدين لا بيد** (`ق-١٣١٨` · ⑪A1): تعديلُ اشتراكٍ يدويّ **مالٌ يقع مرّةً**، فيُستهلك
    //    قرارٌ أقرّه **مديرٌ آخر**. ⛔ **ولا يعمل بحسابٍ منصّيٍّ واحد** — وهو المقصود لا عطل.
    await this.decisions.consume('SUBSCRIPTION_CHANGE', id);

    const newSubEnd = dto.subEnd ? new Date(dto.subEnd) : existing.subEnd;
    // Editing subEnd forward is this app's only "renew" lever (matches the
    // mockup — no separate activate/unfreeze button): if the new end date is
    // in the future, treat it as a manual reactivation rather than leaving a
    // frozen/stopped company stuck (evaluateCompanyStatus only ever moves
    // ACTIVE -> FROZEN -> STOPPED forward, it never un-freezes on its own).
    // ⛔ والمغلقُ لا يعود بالدفع ولا بتمديد الاشتراك (`ق-٥٤٧`) — يعود بطلبٍ وقرارٍ مسجَّل وحده.
    const reactivate = dto.subEnd && existing.status !== 'ACTIVE' && existing.status !== 'CLOSED' && newSubEnd! > new Date();

    return this.prisma.company.update({
      where: { id },
      data: {
        // subStart is intentionally not editable — it is fixed to the actual
        // activation day (owner's rule). Renewal moves subEnd, never subStart.
        subEnd: dto.subEnd ? new Date(dto.subEnd) : undefined,
        ...(reactivate ? { status: 'ACTIVE', frozenAt: null } : {}),
      },
      include: COMPANY_INCLUDE,
    });
  }

  /**
   * Hard delete. Cascades through every business table via Company's
   * onDelete: Cascade relations (the frontend owns the confirm dialog).
   *
   * `client` يقبل عميلَ معاملةٍ (`ق-٥٤١`): فموافقةُ طلب الحذف توسم وتنفّذ في
   * معاملةٍ واحدة — يسقطان معاً أو ينجحان معاً.
   *
   * ⚠️ وسجلٌّ لا يُحذف بحال يشير إلى المنشأة (`Restrict` — `ق-١١٠`: المهامُّ
   * وسجلُّها وسجلُّ التفويض) يجعل القاعدةَ ترفض الحذفَ بـ`P2003`. **والرفضُ يسمّي
   * المانعَ** (`ق-٢٦٥`) — لا وجهَ `500` (مقيسٌ في `ق-٥٣٨`). **والحكمُ في القاعدة لا
   * هنا**: هذه ترجمةُ الرفض لا قرارُه.
   */
  async remove(id: string, client: Prisma.TransactionClient | PrismaService = this.prisma): Promise<void> {
    const existing = await client.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(MSG.company_not_found);
    try {
      await client.loginIdentity.delete({ where: { id: existing.loginIdentityId } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        const fieldName = (e.meta as { field_name?: unknown } | undefined)?.field_name;
        throw new ConflictException(formatMessage(MSG.company_delete_blocked, { records: blockingRecordsFrom(fieldName) }));
      }
      throw e;
    }
  }
}
