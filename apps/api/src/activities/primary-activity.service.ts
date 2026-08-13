import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MSG } from '../common/i18n/messages';
import { TenantContext } from '../auth/types';
import { ALLOWED_SCREENS } from '../templates/screens';
import { SCREEN_LABELS } from './screen-labels';
import { SECTORS, Sector, screensFor } from './sectors';

/**
 * اختيار النشاط الرئيسي — **المفتاح الذي يُشغّل الترشيح كله**.
 *
 * `Company.primaryActivityId` يبدأ فارغاً، و`null` يعني **لا ترشيح**. فحتى
 * أول اختيارٍ صريح ترى كل منشأة قائمة ما كانت تراه بالضبط.
 *
 * ## وثلاثة شروط على التغيير (قرار المالك 2026-08-13)
 *
 * ① **يُسجَّل في سجل التدقيق** — فهو يغيّر ما يراه **كل موظف**، لا المالك
 *    وحده. وتغييرٌ بهذا الأثر بلا أثرٍ مكتوب يترك «لماذا اختفت شاشتي؟»
 *    بلا جواب.
 * ② **لا يُطبَّق بلا تأكيدٍ صريح يعرض ما سيختفي** — بالاسم لا بالعدد.
 * ③ **قابلٌ للتراجع فوراً**، والبيانات تبقى: لا صفّ يُحذف بحال.
 */

export interface ScreenChangePreview {
  /** الشاشات التي **ستختفي** — بأسمائها العربية لا بمفاتيحها. */
  willHide: { screen: string; label: string }[];
  /** والتي ستظهر (عند التراجع أو التوسيع). */
  willShow: { screen: string; label: string }[];
  /** ما تراه المنشأة الآن — للمقارنة. */
  currentCount: number;
  nextCount: number;
}

@Injectable()
export class PrimaryActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * ماذا يتغيّر لو صار هذا النشاط رئيسياً؟ — **قراءةٌ خالصة**.
   *
   * ⚠️ ولا تُطبَّق شيئاً. الفصل مقصود: التأكيد يحتاج أن يرى المالك الأثر
   * **قبل** وقوعه، ودالةٌ واحدة تعرض وتطبّق تجعل «العرض» يغيّر الحالة.
   */
  async preview(tenant: TenantContext, nextActivityId: string | null): Promise<ScreenChangePreview> {
    const current = await this.screensNow(tenant.companyId);
    const next = await this.screensIf(tenant.companyId, nextActivityId);

    const label = (s: string) => ({ screen: s, label: SCREEN_LABELS[s] ?? s });
    return {
      willHide: [...current].filter((s) => !next.has(s)).sort().map(label),
      willShow: [...next].filter((s) => !current.has(s)).sort().map(label),
      currentCount: current.size,
      nextCount: next.size,
    };
  }

  /**
   * يطبّق التغيير — **بعد تأكيدٍ صريح**.
   *
   * @param confirmed علَمٌ يرسله العميل بعد أن عرض `preview` على المالك.
   *
   * ⚠️ وليس تجميلاً: بدونه يصير تغيير النشاط نقرةً واحدة **تُخفي أربع
   * شاشات عن كل موظف** بلا أن يرى أحدٌ ماذا اختفى. والعلَم يجعل الواجهة
   * **مضطرّةً** لعرض الأثر — لا مخيَّرة.
   */
  async apply(tenant: TenantContext, nextActivityId: string | null, confirmed: boolean): Promise<ScreenChangePreview> {
    if (!confirmed) throw new BadRequestException(MSG.primary_activity_needs_confirmation);

    if (nextActivityId) {
      const activity = await this.prisma.businessActivity.findFirst({
        where: { id: nextActivityId, companyId: tenant.companyId },
        select: { id: true, name: true, sector: true, disabledAt: true },
      });
      if (!activity) throw new NotFoundException(MSG.activity_not_found);
      // نشاطٌ معطَّل لا يصلح رئيسياً: شاشاته لا تُحتسب أصلاً، فيصير
      // الترشيح مشغَّلاً بلا مصدر — والنتيجة النواة وحدها بلا سبب مفهوم.
      if (activity.disabledAt) throw new BadRequestException(MSG.primary_activity_disabled);
    }

    const before = await this.screensNow(tenant.companyId);
    const previous = await this.prisma.company.findUniqueOrThrow({
      where: { id: tenant.companyId },
      select: { primaryActivityId: true },
    });

    await this.prisma.company.update({
      where: { id: tenant.companyId },
      data: { primaryActivityId: nextActivityId },
    });

    const after = await this.screensNow(tenant.companyId);

    /**
     * ⚠️ **يُسجَّل بعد النجاح لا قبله** — وبالأسماء لا بالمعرّفات.
     *
     * فمن يقرأ السجل بعد شهر يريد «أُخفيت: الكاشير · المنتجات»، لا
     * `uuid` لا يدلّ على شيء. والتسجيل قبل النجاح يكتب تغييراً قد لا يقع.
     */
    await this.audit.record({
      companyId: tenant.companyId,
      actorType: tenant.actorType,
      actorId: tenant.profileId,
      actorName: tenant.profileId,
      screen: 'settings',
      action: 'edit',
      entity: 'primaryActivity',
      entityId: nextActivityId,
      method: 'PATCH',
      path: '/activities/primary',
      details: {
        from: previous.primaryActivityId,
        to: nextActivityId,
        hidden: [...before].filter((s) => !after.has(s)).map((s) => SCREEN_LABELS[s] ?? s),
        shown: [...after].filter((s) => !before.has(s)).map((s) => SCREEN_LABELS[s] ?? s),
      },
      ip: null,
    });

    const label = (s: string) => ({ screen: s, label: SCREEN_LABELS[s] ?? s });
    return {
      willHide: [...before].filter((s) => !after.has(s)).sort().map(label),
      willShow: [...after].filter((s) => !before.has(s)).sort().map(label),
      currentCount: before.size,
      nextCount: after.size,
    };
  }

  // ═══════════════════ الداخلية ═══════════════════

  private screensNow(companyId: string): Promise<Set<string>> {
    return this.prisma.company
      .findUniqueOrThrow({ where: { id: companyId }, select: { primaryActivityId: true } })
      .then((c) => this.screensIf(companyId, c.primaryActivityId));
  }

  /**
   * الشاشات لو كان `primaryActivityId` هو المُمرَّر.
   *
   * ⚠️ **`null` ⇒ الكل** — نفس القاعدة في `TenantGuard` و`PermissionsService`.
   * وثلاثة مواضع تُجيب السؤال نفسه، والخريطة في واحد: `screensFor`.
   */
  private async screensIf(companyId: string, primaryActivityId: string | null): Promise<Set<string>> {
    if (!primaryActivityId) return new Set(ALLOWED_SCREENS);
    const activities = await this.prisma.businessActivity.findMany({
      where: { companyId, disabledAt: null },
      select: { sector: true },
    });
    const sectors = activities
      .map((a) => a.sector)
      .filter((s): s is Sector => s !== null && (SECTORS as readonly string[]).includes(s));
    return screensFor(sectors);
  }
}
