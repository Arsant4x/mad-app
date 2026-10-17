import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { accrueDueWithinTx, AccrualSweepResult } from '../journal/rent-accrual.util';
import { raiseDueFeesWithinTx } from './contract-fees.util';
import { BATCH_TX_OPTIONS, RentRecognitionService } from './rent-recognition.service';
import { SCHEDULE_TIME_ZONE } from '../common/wall-clock.util';
import { companyToday } from '../common/company-day.util';

/**
 * **كنسُ الاستحقاق اليوميّ — نداءٌ للمحرّك لا قاعدةٌ ثانية** (`ق-٩٢٧/٥`).
 *
 * الاستحقاقُ يُرحَّل عند الإنشاء والتجديد والقبض وقبل قراءة الإقرار في مساراتها؛ وهذا
 * الكنسُ يلتقط ما حلّ استحقاقُه **بمرور الوقت وحده** (قسطٌ حلّ موعدُه بلا حدث) — عند
 * الواحدة فجراً، قبل تحوّل الإيراد المؤجَّل في أوّل الشهر بساعة. **وتشغيلٌ مكرَّر يكتب
 * صفراً**: الهدفُ تراكميّ (`pendingTaxPoints`).
 *
 * ⚠️ **الحدُّ نفسُه**: `ScheduleModule` مُعطَّلٌ تحت الاختبار (`ق-٢٩٢`)، فالمنطقُ كلُّه في
 * `accrueDueWithinTx` وتُثبَت به، ولا يحمل `@Cron` إلا نداءً. وفشلُ منشأةٍ لا يوقف البقيّة.
 */
@Injectable()
export class RentAccrualService {
  private readonly logger = new Logger(RentAccrualService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly recognition: RentRecognitionService,
  ) {}

  /**
   * يُرحّل كلَّ ما حلّ حتى `asOf` لمنشأةٍ واحدة — ⚖️ ومعه رسومُ العقود التي حلّت مع أقساطها (السؤالان ٤٩ و٤١٣ · ق-١٦٠٠) في
   * المعاملة نفسِها: فالرسمُ «يُفوتر مع القسط».
   */
  async runForCompany(companyId: string, now: Date = new Date()): Promise<AccrualSweepResult> {
    return this.tenantPrisma.runInTenantContext(
      companyId,
      async (tx) => {
        // The nightly run is just after the company's midnight, still the day before in UTC: what falls due that day is due now.
        const asOf = await companyToday(tx, companyId, now);
        const result = await accrueDueWithinTx(tx, companyId, asOf);
        const fees = await raiseDueFeesWithinTx(tx, companyId, asOf);
        if (fees.blockedByPeriodLock > 0) this.logger.warn(`رسومُ العقود: ${fees.blockedByPeriodLock} قسطاً حجبت فترةٌ مقفلة مطالبةَ رسومه في المنشأة ${companyId}`);
        return result;
      },
      BATCH_TX_OPTIONS,
    );
  }

  @Cron('0 1 * * *', { timeZone: SCHEDULE_TIME_ZONE })
  async runForAllCompanies(): Promise<{ companies: number; accrued: number }> {
    // العميلُ غيرُ المقيَّد عمداً: هذا الموضعُ يعبر المستأجرين ليدخل سياقَ كلٍّ.
    const companies = await this.prisma.company.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });

    let accrued = 0;
    for (const c of companies) {
      try {
        const result = await this.runForCompany(c.id);
        accrued += result.accrued;
        if (result.blockedByPeriodLock > 0) {
          this.logger.warn(`استحقاقُ الإيجار: ${result.blockedByPeriodLock} قسطاً حجبته فترةٌ مقفلة في المنشأة ${c.id}`);
        }
        // ما استُحقّ وقد اكتمل شهرُه يخرج إيراداً في اليوم نفسِه لا في أوّل الشهر —
        // **في معاملةٍ ثانية**: فترةٌ مقفلة تُسقط الاعترافَ لا الاستحقاقَ الذي سبقه.
        if (result.accrued > 0) await this.recognition.runForCompany(c.id);
      } catch (e) {
        this.logger.error(`استحقاقُ الإيجار أخفق للمنشأة ${c.id}`, e instanceof Error ? e.stack : String(e));
      }
    }

    if (accrued > 0) this.logger.log(`استحقاقُ الإيجار: ${accrued} صفّاً عبر ${companies.length} منشأة`);
    return { companies: companies.length, accrued };
  }
}
