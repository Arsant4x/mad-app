import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { round2 } from '../common/money/rounding';
import { postDeferredRecognitionEntry } from '../journal/auto-posting.util';
import { recognitionSchedule } from '../journal/rent-recognition.util';

/**
 * **تحوّلُ الإيراد المؤجَّل — الطرفُ الثاني من القاعدة** (`ق-٤٦٨` · `ق-٤٧٥/①`).
 *
 * القبضُ يُنشئ التزاماً بما لم يُقدَّم بعد، **وهذه تُخرجه إيراداً شهراً بشهر**.
 * **ولا يُبنى المسارُ بأحدهما**: التزامٌ لا يتحوّل يُنتج ميزانيةً كاذبة كما
 * يُنتجه الاعترافُ الفوريّ.
 *
 * ## بالاستحقاق لا بالنبضة
 *
 * لا تسأل «ما حصّةُ هذا الشهر؟» بل **«ما الذي استُحقّ حتى اليوم ولم يُعترَف
 * به؟»** — كـ`outbox.dispatchDue`. **وأثرُ ذلك ثلاثة**:
 *
 *   ① **شهرٌ فات لتعطّلٍ يُعوَّض في التشغيل التالي — بتاريخه هو** لا بتاريخ
 *      التعافي، فيُقرأ في شهره من القائمة.
 *   ② **وتشغيلٌ مكرَّرٌ يُرحّل صفراً**: الهدفُ تراكميّ، فما اعتُرف به لا يُعاد.
 *   ③ **ولا انحرافَ تقريبٍ عبر اثني عشر شهراً**: المُرحَّلُ فرقُ تراكمَين.
 *
 * ## حدُّها المعلَن
 *
 * ⚠️ **`ScheduleModule` مُعطَّلٌ تحت الاختبار** (`ق-٢٩٢`) — **فلا اختبارَ يعبر
 * تشغيلَها المجدوَل**، وحارسُ `scheduler-registered.spec.ts` يثبت التسجيلَ لا
 * السلوك. **فالمنطقُ كلُّه في `runForCompany` وتُثبَت به**، ولا يحمل `@Cron`
 * إلا نداءً.
 *
 * ⚠️ **ومثيلان من الخادم يشغّلانها مرّتين** — **وهو غيرُ ضارٍّ بالبناء**: الهدفُ
 * التراكميّ يجعل الثانيةَ لا تُرحّل شيئاً، تماماً كخاصّية `escalation`.
 */
@Injectable()
export class RentRecognitionService {
  private readonly logger = new Logger(RentRecognitionService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * يُرحّل كلَّ ما استُحقّ حتى `asOf` لمنشأةٍ واحدة.
   *
   * **الالتزامُ لقسطٍ = المقبوضُ − `baseRecognized`.** ولكلِّ موعدِ اعترافٍ
   * هدفٌ تراكميّ، **والمُرحَّلُ فرقُه عمّا سبق** — فلا يُعاد ولا يُنسى.
   */
  async runForCompany(companyId: string, asOf: Date = new Date()): Promise<{ entries: number; recognized: number }> {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => recognizeDueWithinTx(tx, companyId, asOf));
  }

  /**
   * أوّلَ كلِّ شهرٍ عند الثانية فجراً — **و`asOf` يومُ التشغيل نفسُه**، فمواعيدُ
   * الاعتراف تُشتقّ منه: آخرُ شهرٍ اكتمل وما فاته قبلَه.
   *
   * وفشلُ منشأةٍ لا يوقف البقيّة — كسابقتها في `escalation`.
   */
  @Cron('0 2 1 * *')
  async runForAllCompanies(): Promise<{ companies: number; entries: number }> {
    // العميلُ غيرُ المقيَّد عمداً: هذا الموضعُ يعبر المستأجرين ليدخل سياقَ كلٍّ.
    const companies = await this.prisma.company.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });

    let entries = 0;
    for (const c of companies) {
      try {
        const result = await this.runForCompany(c.id);
        entries += result.entries;
      } catch (e) {
        this.logger.error(`تحوّلُ الإيراد المؤجَّل أخفق للمنشأة ${c.id}`, e instanceof Error ? e.stack : String(e));
      }
    }

    // لا يُسجَّل إلا ما جرى فعلاً — سطرٌ شهريٌّ يقول «صفر» يُهجَر فلا يُقرأ.
    if (entries > 0) this.logger.log(`الإيراد المؤجَّل: ${entries} قيداً عبر ${companies.length} منشأة`);
    return { companies: companies.length, entries };
  }
}

/** `2026-03` — يُقرأ في المذكّرة بلا فتح العقد. */
function monthLabel(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * **المحرّكُ نفسُه داخل معاملةٍ قائمة** — كي يستعمله الإلغاءُ بلا معاملةٍ ثانية.
 *
 * ⭐ **ومصدرٌ واحدٌ للقاعدة** (`ق-٤٦٩`): الكنسُ الشهريّ والإلغاءُ يمرّان بهذه
 * الدالّة عينِها — **فلا تتباعد قاعدتان تفعلان الشيءَ نفسه**.
 *
 * `contractId` يقصُرها على عقدٍ واحد؛ وبدونه تكنس المنشأة كلَّها.
 */
export async function recognizeDueWithinTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  asOf: Date,
  contractId?: string,
): Promise<{ entries: number; recognized: number }> {
  // مرشّحون: أقساطٌ بدأت خدمتُها، وقُبض منها أكثرُ ممّا اعتُرف به.
  const candidates = await tx.installment.findMany({
    where: { serviceStart: { not: null, lte: asOf }, serviceEnd: { not: null }, ...(contractId ? { contractId } : {}) },
    select: {
      id: true,
      serviceStart: true,
      serviceEnd: true,
      baseRecognized: true,
      contract: { select: { no: true, tenant: true, unitId: true } },
      payments: { select: { baseNetAmount: true } },
    },
  });

  let entries = 0;
  let recognized = 0;

  for (const i of candidates) {
    const collected = round2(i.payments.reduce((sum, p) => sum + Number(p.baseNetAmount), 0));
    if (collected <= 0) continue;

    const period = { start: i.serviceStart!, end: i.serviceEnd! };
    let already = Number(i.baseRecognized);
    if (already >= collected) continue;

    for (const step of recognitionSchedule(period, collected, asOf)) {
      const delta = round2(step.cumulative - already);
      if (delta <= 0) continue;

      const entry = await postDeferredRecognitionEntry(tx, companyId, {
        unitId: i.contract.unitId,
        contractNo: i.contract.no,
        tenant: i.contract.tenant,
        date: step.date,
        baseAmount: delta,
        periodLabel: monthLabel(step.date),
      });
      // تخطٍّ صامتٌ لنقص حسابٍ لا يُسجَّل اعترافاً: العدّادُ يتبع الدفترَ
      // لا العكس، **وإلّا ضاع التزامٌ لم يخرج من الميزانية أبداً**.
      if (!entry) break;

      already = round2(already + delta);
      entries += 1;
      recognized = round2(recognized + delta);
    }

    if (already !== Number(i.baseRecognized)) {
      await tx.installment.update({ where: { id: i.id }, data: { baseRecognized: new Prisma.Decimal(already) } });
    }
  }

  return { entries, recognized };
}

/**
 * **الالتزامُ الباقي على عقدٍ** = المقبوضُ − المعترَفُ به، لكلِّ أقساطه.
 *
 * يُقرأ **بعد** `recognizeDueWithinTx` حتى تاريخ الإلغاء — **فما بقي بعدها
 * مقبوضٌ عن مدّةٍ لن تُقدَّم**، وهو وحده موضوعُ السؤال (`ق-٤٧٢`).
 */
export async function outstandingDeferredWithinTx(tx: Prisma.TransactionClient, contractId: string): Promise<number> {
  const installments = await tx.installment.findMany({
    where: { contractId },
    select: { baseRecognized: true, payments: { select: { baseNetAmount: true } } },
  });

  return round2(
    installments.reduce((sum, i) => {
      const collected = i.payments.reduce((s, p) => s + Number(p.baseNetAmount), 0);
      return sum + Math.max(0, collected - Number(i.baseRecognized));
    }, 0),
  );
}

/**
 * **يُغلق العدّاد بعد إقفال الالتزام بقيدٍ واحد** — فلا يعود الكنسُ الشهريّ
 * يرى التزاماً خرج بالفعل، **فيُرحّله ثانيةً بلا مقابل**.
 *
 * ⚠️ **والعدّادُ يقول «ما خرج من الالتزام» لا «ما صار إيراداً»**: الخارجُ قد
 * يكون إيراداً شهرياً، **أو ردّاً للمستأجر، أو دخلاً آخر عند الإلغاء** — وهي
 * وجهاتٌ ثلاثٌ لالتزامٍ واحد.
 */
export async function closeDeferredWithinTx(tx: Prisma.TransactionClient, contractId: string): Promise<void> {
  const installments = await tx.installment.findMany({
    where: { contractId },
    select: { id: true, baseRecognized: true, payments: { select: { baseNetAmount: true } } },
  });

  for (const i of installments) {
    const collected = round2(i.payments.reduce((s, p) => s + Number(p.baseNetAmount), 0));
    if (collected <= Number(i.baseRecognized)) continue;
    await tx.installment.update({ where: { id: i.id }, data: { baseRecognized: new Prisma.Decimal(collected) } });
  }
}
