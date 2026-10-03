import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from './tenant-prisma.service';
import { SupportAccessService } from '../../support-access/support-access.service';
import { JwtPayload } from '../../auth/types';
import { evaluateCompanyStatus } from './company-status.util';
import { AccountClosedException, AccountFrozenException, AccountStoppedException, ActionForbiddenException, ConsentRequiredException, MasterDataLockedException, ScreenForbiddenException, ScreenNotInSectorException } from './tenant.exceptions';
import { ALLOW_WHILE_CLOSED_KEY } from './allow-while-closed.decorator';
import { ALLOW_WHILE_CONSENT_PENDING_KEY } from './allow-while-consent-pending.decorator';
import { ConsentService } from '../../consent/consent.service';
import { reopenUntil } from './reopen-window';
import { SECTORS, Sector, screensFor } from '../../activities/sectors';
import { REQUIRES_SCREEN_KEY } from './requires-screen.decorator';
import { REQUIRES_ACTION_KEY } from './requires-action.decorator';
import { ALLOW_WHILE_INACTIVE_KEY } from './allow-while-frozen.decorator';
import { SUPPORT_SHELL_KEY } from './support-shell.decorator';
import { TENANT_WIDE_KEY } from './tenant-wide.decorator';
import { COMPANY_WIDE_FIGURES_KEY } from './company-wide-figures.decorator';
import { OWNER_ONLY_KEY } from './owner-only.decorator';
import { isActionAllowed, type ScreenAction, type ScreenActionMap } from '../../templates/screens';
import { clipToCompany, grantsOf } from '../../templates/template-clip.util';
import { MSG } from '../i18n/messages';
import { IntegrationUsageService, USAGE_API_KEY } from '../../api-keys/integration-usage.service';

/** Screens holding the records the whole ledger hangs off. Freezing these is
 * what the master-data lock is for — invoices and payments stay editable. */
const MASTER_DATA_SCREENS = new Set(['properties', 'contracts']);
const WRITE_ACTIONS = new Set(['add', 'edit', 'delete']);

/**
 * Runs after JwtAuthGuard on every tenant (COMPANY / COMPANY_USER) route.
 * Re-checks status straight from the DB on every request — the JWT is not
 * trusted for authorization decisions, only identity, because a company can
 * be frozen/stopped mid-session and that must take effect immediately without
 * waiting for the token to expire.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly reflector: Reflector,
    private readonly supportAccessService: SupportAccessService,
    private readonly consent: ConsentService,
    private readonly usage: IntegrationUsageService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const payload = req.user as JwtPayload | undefined;

    // ---- وضع الدعم الفني (§1.10) ----
    // A PLATFORM_ADMIN carrying X-Support-Company enters that company's data
    // IF AND ONLY IF an owner-approved, unexpired grant exists — read-only,
    // and every single request lands in a log the owner reads. No grant, no
    // entry: consent is enforced here, not promised in a policy document.
    if (payload?.actorType === 'PLATFORM_ADMIN') {
      const supportCompanyId = req.header('x-support-company');
      if (!supportCompanyId) throw new UnauthorizedException(MSG.company_login_required);

      const grant = await this.supportAccessService.activeGrantFor(supportCompanyId);
      if (!grant) throw new ForbiddenException(MSG.support_no_active_grant);
      /**
       * 🔴 **الإذنُ لطالبه لا لكلّ مدير منصّة** (`ق-٥٢٨`): المالكُ وافق على اسمٍ
       * وسببٍ ونطاق — **ومديرٌ آخر يدخل بإذن غيره يقلب السجلَ كذباً**. كانت
       * السلامةُ مستعارةً من العدد (مديرٌ واحد) — **ومديرٌ ثانٍ يكسرها**.
       */
      if (grant.requestedById !== payload.profileId) throw new ForbiddenException(MSG.support_grant_not_yours);

      const method = req.method.toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') throw new ForbiddenException(MSG.support_read_only);

      /**
       * 🔴 **النطاقُ يُنفَذ هنا لا يُعرض فحسب** (`ق-٥٢٧`).
       *
       * **كان الدعمُ يرى كلَّ شيء** (`allowedScreens: 'all'`) — والإذنُ يحمل
       * الغرضَ والمدةَ **ولا يحمل فئاتِ البيانات** التي توجبها اللائحةُ
       * التنفيذية (م١٧/١/ب). **وم١٧/٤ أثقل**: من خالف التعليمةَ عُدّ في حكم
       * جهة التحكم — **فالإنفاذُ التقنيُّ هو ما يُبقينا معالجاً**.
       *
       * ⚠️ **ومغلقٌ افتراضياً**: مسارٌ بلا شاشةٍ معلَنة لا يُقرأ — إلا ما أعلن
       * نفسَه `@SupportShell()` لأنه يُعيد هويّةَ السائل لا بيانات المنشأة.
       * **وهذا الفرعُ يعود قبل فحوص الشاشة العامّة أدناه** — فلا يُتَّكل عليها.
       */
      const requiredScreen = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_SCREEN_KEY, [context.getHandler(), context.getClass()]);
      const supportShell = this.reflector.getAllAndOverride<boolean | undefined>(SUPPORT_SHELL_KEY, [context.getHandler(), context.getClass()]);
      if (!requiredScreen && !supportShell) throw new ForbiddenException(MSG.support_scope_undeclared);
      if (requiredScreen && !grant.screens.includes(requiredScreen)) throw new ForbiddenException(MSG.support_scope_forbidden);

      // The log line is part of the access itself — if it can't be written,
      // the access doesn't happen.
      await this.supportAccessService.logAccess(grant.id, supportCompanyId, method, req.path, { id: payload.profileId, name: payload.username });

      req.tenant = {
        companyId: supportCompanyId,
        actorType: payload.actorType,
        profileId: payload.profileId,
        allowedScreens: grant.screens,
        allowedBranchIds: 'all',
      };
      return true;
    }

    if (!payload || !payload.companyId) {
      throw new UnauthorizedException(MSG.company_login_required);
    }

    // 🔴 المنشأةُ وقالبُها **تحت سياقها** (`ق-٦٧٥` · المرحلة ③): `permission_templates` تحت
    //    `FORCE` — قالبُ منشأةٍ خاصٌّ لا يُرى بلا سياق فيعود التضمينُ فارغاً ويسقط الحارسُ.
    //    `companies` بلا سياسة، فالقراءةُ داخل السياق تعطي الصفَّ نفسَه.
    const tenantCompanyId = payload.companyId;
    const company = await this.tenantPrisma.runInTenantContext(tenantCompanyId, (tx) =>
      tx.company.findUniqueOrThrow({
        where: { id: tenantCompanyId },
        include: { permissionTemplate: true },
      }),
    );

    const evaluated = evaluateCompanyStatus(company);
    if (evaluated.status !== company.status || evaluated.frozenAt?.getTime() !== company.frozenAt?.getTime()) {
      await this.prisma.company.update({
        where: { id: company.id },
        data: { status: evaluated.status, frozenAt: evaluated.frozenAt },
      });
    }

    // Subscription self-service (view + renew/pay) is the one thing a lapsed
    // tenant may always reach, so it can reactivate from inside the platform.
    const subscriptionSelfService = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_WHILE_INACTIVE_KEY, [context.getHandler(), context.getClass()]);

    // CLOSED (`ق-٥٤٧`): الوصولُ مقطوعٌ إلا حالُ الطلب وطلبُ إعادة الفتح — ولا يعود بالدفع،
    // فلا يمرّ بثقب الاشتراك. والرسالةُ تحمل أجلَ الحفظ الأدنى وأجلَ العودة (`ق-٥٥٩`).
    if (company.status === 'CLOSED') {
      const allowWhileClosed = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_WHILE_CLOSED_KEY, [context.getHandler(), context.getClass()]);
      if (!allowWhileClosed) {
        const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');
        throw new AccountClosedException(day(company.retainUntil), day(company.closedAt ? reopenUntil(company.closedAt) : null));
      }
    }

    // ⭐ موافقةُ المعالجين الفرعيين (`ق-٥٨٩`) — **اختيارٌ لا حجب**: من لم يقبل النسخةَ
    // السارية لا تمرّ بياناتُه بمعالجٍ لم يأذن به (اللائحة م١٧/٥) — **ويبقى أمامه بابان**:
    // يقبل من مساره، أو يصدّر ويُغلق (وكلاهما معلَّمٌ `@AllowWhileConsentPending`).
    //
    // ⚠️ **وبعد `CLOSED` عمداً**: المغلقُ لا يُسأل موافقةً على معالجةٍ لم تعد تقع له،
    // ورسالةُ الإغلاق أولى بالقراءة من رسالة الموافقة.
    const effective = await this.consent.effectiveVersion();
    if (effective.version !== null && company.consentedListVersion !== effective.version) {
      const allowWhileConsentPending = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_WHILE_CONSENT_PENDING_KEY, [context.getHandler(), context.getClass()]);
      if (!allowWhileConsentPending) throw new ConsentRequiredException(effective.effectiveFrom ? effective.effectiveFrom.toISOString().slice(0, 10) : '—');
    }

    // STOPPED is a full lock-out — except subscription self-service.
    if (evaluated.status === 'STOPPED' && !subscriptionSelfService) throw new AccountStoppedException();
    // FROZEN is the post-expiry grace period: the tenant may still read and
    // export its own data, but not add/edit/delete anything (owner's rule). So
    // only mutating methods are blocked; GET/HEAD and renewal pass through.
    if (evaluated.status === 'FROZEN') {
      const method = req.method.toUpperCase();
      const isRead = method === 'GET' || method === 'HEAD';
      if (!isRead && !subscriptionSelfService) throw new AccountFrozenException();
    }

    let isAllScreens = company.permissionTemplate.isAllScreens;
    let allowedScreens: string[] | 'all' = isAllScreens ? 'all' : company.permissionTemplate.allowedScreens;
    let screenActions = (company.permissionTemplate.screenActions ?? null) as ScreenActionMap | null;
    // The company owner always sees every branch, including the consolidated
    // view (CLAUDE.md 6.8) — only employees can be narrowed.
    let allowedBranchIds: string[] | 'all' = 'all';
    let canEditMasterData = false;

    if (payload.actorType === 'INTEGRATION') {
      /**
       * **مفتاحُ نظامٍ خارجيّ** (`ق-١٢٩١` · ي/⑫A3) — **يُعامَل موظّفاً مقيَّداً**.
       *
       * والقالبُ يُقرأ **حيّاً من القاعدة** لا من الرمز: قالبٌ ضُيِّق أو مفتاحٌ أُبطل
       * يسري **في الطلب التالي** — وهي قاعدةُ «لا ذاكرةَ مؤقتة للصلاحيات» (`CLAUDE §4`)
       * تسري على المفتاح كما تسري على الموظّف.
       *
       * ⚠️ **وحدٌّ معلَن**: `allowedBranchIds: 'all'` — المفتاحُ لا يُقيَّد بفرعٍ اليوم،
       * **ويُقيَّد حين يُطلب** بجدولٍ كـ`company_user_branches`.
       */
      const key = await this.tenantPrisma.runInTenantContext(payload.companyId, (tx) =>
        tx.apiKey.findUnique({ where: { id: payload.profileId }, include: { permissionTemplate: true } }),
      );
      // مفتاحٌ أُبطل أو حُذفت منشأتُه — **والرفضُ من الحارس لا من الباب**: الباب يُثبت
      // الهويّةَ، وهذا يفحص الحال في كلِّ طلب.
      if (!key || key.revokedAt) throw new UnauthorizedException(MSG.api_key_invalid);
      /**
       * **قياسُ الاستعمال والحصّة** (`ق-١٢٩١` · ي/㉑A1) — **بعد إثبات المفتاح وقبل
       * العمل**: فنداءٌ بمفتاحٍ مزوَّر لا يُعدّ على أحد، **ونداءٌ صحيحٌ يُعدّ ولو رُدّ
       * بعدها** (تجاوزُ الحصّة لا يُشترى بتكرار المحاولة).
       */
      await this.usage.recordAndCheck(payload.companyId, USAGE_API_KEY, company.apiMonthlyQuota);
      isAllScreens = key.permissionTemplate.isAllScreens;
      allowedScreens = isAllScreens ? 'all' : key.permissionTemplate.allowedScreens;
      screenActions = (key.permissionTemplate.screenActions ?? null) as ScreenActionMap | null;
      canEditMasterData = false;
      allowedBranchIds = 'all';
    } else if (payload.actorType === 'COMPANY_USER') {
      /**
       * 🔴 **تحت سياق المنشأة لا خارجه** (`ق-٦٥٧` · المرحلة ①).
       *
       * كانت هذه القراءةُ بلا سياق، **وهي التي تحمل فروعَ الموظّف**: لو رُفع
       * `FORCE` على `company_user_branches` (المرحلة ④) لعادت `branches` **فارغةً
       * بنجاح** — فيُقرأ الموظّفُ المضيَّق **«بلا تضييق»** ويصير `allowedBranchIds`
       * `'all'`: **أسوأُ كسورِ العائق المقيسة**. السياقُ هنا لا يغيّر شيئاً اليوم
       * (لا سياسةَ بعد) — ويجعل الإغلاقَ ممكناً غداً.
       */
      const companyUser = await this.tenantPrisma.runInTenantContext(payload.companyId, (tx) =>
        tx.companyUser.findUniqueOrThrow({
          where: { id: payload.profileId },
          include: { permissionTemplate: true, branches: { select: { branchId: true } } },
        }),
      );
      if (companyUser.status !== 'ACTIVE') {
        throw new AccountFrozenException();
      }
      isAllScreens = companyUser.permissionTemplate.isAllScreens;
      allowedScreens = isAllScreens ? 'all' : companyUser.permissionTemplate.allowedScreens;
      screenActions = (companyUser.permissionTemplate.screenActions ?? null) as ScreenActionMap | null;
      canEditMasterData = companyUser.canEditMasterData;
      // ⚖️ `ق-١٤٦٨` — «كلُّ الفروع» علَمٌ يُقرأ لا غيابٌ يُستنتج، والقائمةُ الفارغةُ لا فرع (صفوفُ المنشأة العامّة وحدَها).
      // كان الغيابُ يُقرأ «الكلّ»، فكان كلُّ ما يُفرغ الإسنادَ — قراءةٌ عمياء أعلاه أو حذفٌ خارج الخدمة — يوسّع بصمت.
      // والقائمون بلا إسنادٍ وُسموا `true` في الهجرة فبقي سلوكُهم.
      allowedBranchIds = companyUser.allBranches ? 'all' : companyUser.branches.map((b) => b.branchId);
    }

    // ⚖️ **قالبُ الموظّف ومفتاحُ النظام يُقصّان بقالب المنشأة** (توجيه ٢٧٦ · ق-١٦٠١): كانا يحلّان محلَّه فيرى الموظّفُ ما لا تراه
    //    منشأتُه. والتقاطعُ من الدالّة الواحدة التي يقرؤها `/me/permissions` أيضاً.
    if (payload.actorType === 'COMPANY_USER' || payload.actorType === 'INTEGRATION') {
      const clipped = clipToCompany({ isAllScreens, allowedScreens: allowedScreens === 'all' ? [] : allowedScreens, screenActions }, grantsOf(company.permissionTemplate));
      isAllScreens = clipped.isAllScreens;
      allowedScreens = clipped.isAllScreens ? 'all' : clipped.allowedScreens;
      screenActions = clipped.screenActions;
    }

    // getAllAndOverride, not get(..., context.getHandler()) alone — every
    // @RequiresScreen() in this app decorates the controller *class*, not
    // individual method handlers, so a handler-only lookup always returned
    // undefined and silently skipped this check entirely. Real bug, caught
    // manually while testing the new permission-template feature: a
    // limited-template CompanyUser could reach any screen's endpoints.
    const requiredScreen = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_SCREEN_KEY, [context.getHandler(), context.getClass()]);

    /**
     * 🔴 **مغلقٌ افتراضياً — كوضع الدعم أعلاه** (`ق-١١٩٨`/①، مراجعةٌ خارجية).
     *
     * مسارٌ لا يُعلن شاشتَه كان يمرّ من هنا **بكلّ فاعل** إلى خدمته، والحمايةُ
     * الوحيدة أن تتذكّر الخدمةُ `assertIsCompanyOwner` — سبعةُ متحكّماتٍ كانت
     * كذلك، وكلُّها تذكّرت (مقيس: الموظّفُ يُردّ `403` على سعر الصرف والرقم الضريبي
     * ومستودع الفرع)؛ **والثامنُ الذي لا يتذكّر لا يُنبّه عنه شيء**. فصار المسارُ يُعلن
     * نفسَه: شاشةٌ (`@RequiresScreen`) · أو للمالك وحدَه (`@OwnerOnly` — يُنفَذ هنا) ·
     * أو مفتوحٌ لكلّ فاعلٍ بسببٍ مكتوب (`@TenantWide`) · أو قشرةُ الهويّة (`@SupportShell`).
     * وما عداه يُرفض — والحارسُ الساكن `tenant-guard-declared.spec` يُدين المتحكّمَ
     * الجديد قبل أن يبلغ السير.
     */
    // قيمةُ الوسم رسالتُه — رسالةُ الخدمة نفسِها حين لها واحدة، وإلا `MSG.owner_only` (انظر المزخرِف).
    const ownerOnly = this.reflector.getAllAndOverride<string | undefined>(OWNER_ONLY_KEY, [context.getHandler(), context.getClass()]);
    const tenantWide = this.reflector.getAllAndOverride<string | undefined>(TENANT_WIDE_KEY, [context.getHandler(), context.getClass()]);
    const supportShell = this.reflector.getAllAndOverride<boolean | undefined>(SUPPORT_SHELL_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredScreen && !ownerOnly && !tenantWide && !supportShell) throw new ForbiddenException(MSG.screen_undeclared);
    if (ownerOnly && payload.actorType !== 'COMPANY') throw new ForbiddenException(ownerOnly);

    /**
     * ⚠️ **ترشيح النشاط قبل فحص القالب — والترتيب مقصود.**
     *
     * السببان مختلفان تماماً، وما يفعله التاجر بعدهما مختلف:
     *
     *   - النشاط لا يشمل الشاشة ⇒ **يضيف نشاطاً** من إعداداته.
     *   - القالب لا يمنحها ⇒ **يطلبها من صاحب المنشأة**.
     *
     * ولو فُحص القالب أولاً لقيل لصاحب المنشأة نفسه — وهو يملك كل الشاشات —
     * «لا تملك صلاحية»، وهو **جوابٌ كاذب**: يملكها ونشاطه لا يشملها.
     *
     * ⚠️ وهذا الفحص هو ما يجعل القاعدة الثالثة محقَّقة: الترشيح في
     * `/me/permissions` وحده **تجميلٌ لا حماية** — يُخفي الرابط ويترك
     * العنوان المباشر يمرّ.
     */
    if (requiredScreen) {
      const sectorScreens = await this.sectorScreensFor(company.id);
      if (sectorScreens && !sectorScreens.has(requiredScreen)) {
        throw new ScreenNotInSectorException(requiredScreen);
      }
    }

    if (requiredScreen && allowedScreens !== 'all' && !allowedScreens.includes(requiredScreen)) {
      throw new ScreenForbiddenException(requiredScreen);
    }

    // Action-level check, opt-in per endpoint (@RequiresAction). Only meaningful
    // once the screen is allowed; a screen with no explicit action set grants
    // all actions (backward compat), so pre-existing templates never regress.
    const requiredAction = this.reflector.getAllAndOverride<ScreenAction | undefined>(REQUIRES_ACTION_KEY, [context.getHandler(), context.getClass()]);
    if (requiredScreen && requiredAction && !isActionAllowed(isAllScreens, allowedScreens === 'all' ? [] : allowedScreens, screenActions, requiredScreen, requiredAction)) {
      throw new ActionForbiddenException(requiredAction, requiredScreen);
    }

    // Master-data lock: when the company freezes its asset register, only the
    // owner and explicitly-exempted employees may still change it. Reads and
    // every other screen are untouched — this protects the records the whole
    // ledger hangs off, not the day-to-day work.
    if (company.masterDataLocked && requiredScreen && MASTER_DATA_SCREENS.has(requiredScreen) && requiredAction && WRITE_ACTIONS.has(requiredAction)) {
      if (payload.actorType !== 'COMPANY' && !canEditMasterData) {
        throw new MasterDataLockedException();
      }
    }

    // ⚖️ رقمُ المنشأة كلِّها لمن يرى فروعَها كلَّها (`ق-١٥٨١`) — بعد الشاشة والفعل، فمن لا يملك الشاشةَ يُقال له ذلك أولاً.
    if (this.reflector.getAllAndOverride<string | undefined>(COMPANY_WIDE_FIGURES_KEY, [context.getHandler(), context.getClass()]) && allowedBranchIds !== 'all') {
      throw new ForbiddenException(MSG.company_figures_whole_company);
    }

    req.tenant = {
      companyId: payload.companyId,
      actorType: payload.actorType,
      profileId: payload.profileId,
      allowedScreens,
      allowedBranchIds,
    };
    return true;
  }

  /**
   * شاشات أنشطة المنشأة — أو `null` إن كان الترشيح **مطفأً**.
   *
   * ⚠️ نسخةٌ من منطق `PermissionsService.sectorScreensFor` **عمداً لا
   * سهواً**: الحارس يعمل على كل طلب في التطبيق، وحقنُ خدمةٍ من وحدةٍ
   * أخرى فيه يخلق اعتماداً دائرياً (`PermissionsModule` يستعمل الحارس).
   *
   * والمصدر الحقيقي واحد رغم ذلك: **`screensFor` في `activities/sectors.ts`**
   * — وهي التي تحمل الخريطة والقواعد. وما يتكرّر هنا استعلامان لا منطق،
   * وحارسٌ يقارن مخرَج الاثنين يمنع افتراقهما.
   */
  private async sectorScreensFor(companyId: string): Promise<Set<string> | null> {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { primaryActivityId: true },
    });
    // `null` ⇒ لا ترشيح: المنشأة القائمة ترى ما كانت تراه بالضبط.
    if (!company.primaryActivityId) return null;

    // ⚠️ **تحت سياق المستأجر**: `business_activities` عليه RLS ENABLE+FORCE،
    // وقراءةٌ خارجه تعود **فارغةً بنجاح** — فتصير `sectors` خاوية،
    // و`screensFor([])` تُرجع الكل، **فيتعطّل الترشيح كله بصمت**.
    const activities = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.businessActivity.findMany({ where: { disabledAt: null }, select: { sector: true } }),
    );
    const sectors = activities
      .map((a) => a.sector)
      .filter((s): s is Sector => s !== null && (SECTORS as readonly string[]).includes(s));
    return screensFor(sectors);
  }
}
