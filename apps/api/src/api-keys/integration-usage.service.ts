import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { KSA_UTC_OFFSET_MIN, localDateOf } from '../common/wall-clock.util';
import { MSG, formatMessage } from '../common/i18n/messages';

/** نوعُ الاستعمال — يتوسّع بمزوّدٍ خارجيٍّ بالآلية نفسِها (واثق · مُدد). */
export const USAGE_API_KEY = 'API_KEY';

/** الشهرُ `YYYY-MM` **بتوقيت الرياض** — فالتاجرُ يقرأ استعمالَه بشهره هو. */
export function usagePeriod(now: Date = new Date()): string {
  return localDateOf(now, KSA_UTC_OFFSET_MIN).slice(0, 7);
}

export interface UsageView {
  period: string;
  kind: string;
  count: number;
  quota: number | null;
  lastAt: Date;
}

@Injectable()
export class IntegrationUsageService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * **يعدّ النداءَ ويحكم بالحصّة في عبارةٍ واحدة** (`ق-١٢٩١` · ي/㉑A1).
   *
   * ## لماذا العدُّ قبل الحكم لا بعده
   *
   * لو قُرئ العدُّ ثم زِيد، لمرّ نداءان متزامنان على القراءة نفسِها فتجاوزا الحصّةَ معاً
   * — وهي عائلةُ سباقات الطبقات (`ق-٨١٤`). **فالزيادةُ ذرّيّةٌ (`upsert` على المفتاح
   * الطبيعيّ) والحكمُ على ما أعادته** — فلا نافذةَ بين القراءة والكتابة.
   *
   * ⚠️ **والنداءُ المرفوض معدودٌ كذلك**: من تجاوز الحصّةَ لا يشتري محاولاتٍ مجّانيةً
   * بتكرار المحاولة. **وهذا مقصود**، ويُقال في الرسالة: العدُّ يشمل ما رُدّ.
   *
   * ⚠️ **و`null` حصّةٌ = بلا حدّ** — فلا رقمَ افتراضيّ يُكتب قبل أن تُحسم الباقات.
   */
  async recordAndCheck(companyId: string, kind: string, quota: number | null, now: Date = new Date()): Promise<number> {
    const period = usagePeriod(now);
    const row = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.integrationUsage.upsert({
        where: { companyId_kind_period: { companyId, kind, period } },
        create: { companyId, kind, period, count: 1, lastAt: now },
        update: { count: { increment: 1 }, lastAt: now },
        select: { count: true },
      }),
    );
    if (quota !== null && row.count > quota) {
      // `formatMessage` هو نمطُ الرسائل ذاتِ المعاملات في المشروع — يحلّها مرشّحُ اللغة
      // بلغة الطلب. ⚠️ **ولا يُكتب مخرَجُه في قاعدة البيانات** (يحمل فاصلَ المعاملات — `ق-١٢٨٣`).
      throw new HttpException(formatMessage(MSG.integration_quota_exceeded, { quota: String(quota), used: String(row.count) }), HttpStatus.TOO_MANY_REQUESTS);
    }
    return row.count;
  }

  /** ما يقرؤه المالك في شاشته — شهرُه الجاري وما قبله. */
  async list(companyId: string, quota: number | null, months = 6): Promise<UsageView[]> {
    const rows = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.integrationUsage.findMany({ orderBy: [{ period: 'desc' }, { kind: 'asc' }], take: months * 4 }),
    );
    return rows.map((r) => ({ period: r.period, kind: r.kind, count: r.count, quota, lastAt: r.lastAt }));
  }
}
