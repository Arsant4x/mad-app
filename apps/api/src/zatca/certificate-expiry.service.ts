import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationKind } from '@mad-app/db';
import { SCHEDULE_TIME_ZONE } from '../common/wall-clock.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CERT_EXPIRY_WARN_DAYS, certificateNotAfter, daysUntil } from './certificate-expiry.util';
import { decryptSecret } from '../common/crypto/secret.util';

/**
 * **مراقبةُ انتهاء شهادة الفوترة الإلكترونية** (`ق-١٢٧٩` · ز/⑤A1 — `domain-scan/05` A1).
 *
 * ## العطل الذي تغلقه
 * شهادةُ الإنتاج تنتهي (سنةً عادةً)، **وأوّلُ علامةٍ اليوم رفضُ كلِّ فواتير اليوم** — لا حقلَ
 * يحمل التاريخ ولا تنبيه؛ والتعافي إعادةُ تسجيلٍ يدويةٌ برمزٍ جديد. والدَّينُ مكتوبٌ في
 * `zatca-onboarding.service.ts` منذ بُني المسار.
 *
 * ## ما تفعله
 * كلَّ ليلة: تقرأ `certificateNotAfter` (أو تستخرجه من الشهادة المخزَّنة إن كان الصفُّ سابقاً
 * للبناء — **قراءةٌ لا تخمين**)، وتنبّه صاحبَ المنشأة قبل ثلاثين يوماً، **ومرّةً واحدة لكلِّ
 * شهادةٍ** (`expiryNotifiedAt`) فلا يتكرّر التنبيه كلَّ ليلة حتى يصير ضجيجاً يُهمَل.
 *
 * ⚠️ **وما لم يُبنَ معلَناً**: نداءُ التجديد `PATCH /production/csids` — يحتاج شهادةَ إنتاجٍ حيّة
 * ورمزاً من بوّابة فاتورة (بيد المالك)، فلا يُثبَت محلياً. **والمراقبةُ وحدَها تُغيّر الحال**:
 * تنبيهٌ قبل شهر بدل مفاجأةٍ برفض يومٍ كامل.
 */
@Injectable()
export class CertificateExpiryService {
  private readonly logger = new Logger(CertificateExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  /** المنشآتُ التي تقترب شهادتُها من الانتهاء — يُنبَّه مالكُها مرّةً لكلِّ شهادة. */
  @Cron(CronExpression.EVERY_DAY_AT_6AM, { timeZone: SCHEDULE_TIME_ZONE })
  async sweep(now: Date = new Date()): Promise<{ checked: number; notified: number; expired: number }> {
    /**
     * ⚠️ **وأوّلُ صياغةٍ قرأت `zatca_credentials` بالعميل غير المقيَّد فعادت فارغةً بنجاح**
     * — الجدولُ تحت `FORCE`, فالكنسُ كان يرى صفراً بلا خطأ (عائلةُ `ق-٢٦٢`، وهي نفسُها التي
     * وقعت في كنس السلّة قبل يومٍ واحد — `ق-١٢٧٦`). أمسكها الحارسُ الحيّ لا القراءة.
     *
     * **فالمنشآتُ تُقرأ من جدولها** (بلا `RLS`) **ثم يُدخَل سياقُ كلٍّ** — نمطُ `rent-accrual`؛
     * ومن لا شهادةَ إنتاجٍ لها تعود فوراً من `checkCompany` بلا عمل.
     */
    const companies = await this.prisma.company.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    const credentials = companies.map((c) => ({ companyId: c.id }));

    let notified = 0;
    let expired = 0;
    for (const { companyId } of credentials) {
      try {
        const result = await this.checkCompany(companyId, now);
        if (result.notified) notified += 1;
        if (result.expired) expired += 1;
      } catch (e) {
        this.logger.error(`فحصُ انتهاء الشهادة أخفق للمنشأة ${companyId}: ${(e as Error).message}`);
      }
    }
    if (notified > 0 || expired > 0) {
      this.logger.warn(`شهاداتُ الفوترة: ${notified} تنبيهاً جديداً · ${expired} منتهيةً فعلاً من ${credentials.length}`);
    }
    return { checked: credentials.length, notified, expired };
  }

  /** فحصُ منشأةٍ واحدة — داخل سياقها (الجداولُ تحت `FORCE`). */
  async checkCompany(companyId: string, now: Date = new Date()): Promise<{ notAfter: Date | null; daysLeft: number | null; notified: boolean; expired: boolean }> {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const credential = await tx.zatcaCredential.findUnique({
        where: { companyId },
        select: { certificateNotAfter: true, productionCsidEnc: true, expiryNotifiedAt: true },
      });
      if (!credential?.productionCsidEnc) return { notAfter: null, daysLeft: null, notified: false, expired: false };

      // الصفُّ السابقُ للبناء بلا تاريخ — يُقرأ من الشهادة نفسِها ويُحفظ، **مرّةً**.
      let notAfter = credential.certificateNotAfter;
      if (!notAfter) {
        notAfter = certificateNotAfter(decryptSecret(credential.productionCsidEnc));
        if (notAfter) await tx.zatcaCredential.update({ where: { companyId }, data: { certificateNotAfter: notAfter } });
      }
      if (!notAfter) {
        // شهادةٌ لا تُقرأ: يُعلَن ولا يُفترض أنها سليمة — والتاجرُ لا يُنبَّه بما لا نعرفه.
        this.logger.warn(`تعذّرت قراءةُ نهاية صلاحية شهادة المنشأة ${companyId} — لا تنبيه، والحالُ يُعرض فارغاً`);
        return { notAfter: null, daysLeft: null, notified: false, expired: false };
      }

      const daysLeft = daysUntil(notAfter, now);
      if (daysLeft > CERT_EXPIRY_WARN_DAYS) return { notAfter, daysLeft, notified: false, expired: false };

      // مرّةً لكلِّ شهادة: `dedupeKey` بتاريخ انتهائها — فشهادةٌ جديدة تُنبّه من جديد.
      const day = notAfter.toISOString().slice(0, 10);
      const expired = daysLeft <= 0;
      const raised = await NotificationsService.raise(tx, companyId, {
        kind: NotificationKind.ZATCA_CERT_EXPIRING,
        dedupeKey: `zatca-cert:${day}`,
        title: expired ? 'انتهت شهادةُ الفوترة الإلكترونية' : `شهادةُ الفوترة الإلكترونية تنتهي بعد ${daysLeft} يوماً`,
        body: expired
          ? `انتهت صلاحيةُ الشهادة في ${day} — والهيئةُ ترفض كلَّ فاتورةٍ تُرسَل بها. يلزم تجديدُها برمزٍ من بوّابة فاتورة.`
          : `تنتهي صلاحيةُ الشهادة في ${day}. جدّدها قبلها — فبعد انتهائها تُرفض كلُّ فاتورةٍ تُرسَل بها.`,
        linkScreen: 'settings',
      });
      if (raised) await tx.zatcaCredential.update({ where: { companyId }, data: { expiryNotifiedAt: now } });
      return { notAfter, daysLeft, notified: raised, expired };
    });
  }
}
