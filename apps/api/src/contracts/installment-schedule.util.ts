import { allocateEvenly } from '../common/money/allocation';
const CYCLE_STEP_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

/**
 * قسطٌ في الجدول — **ومعه الفترةُ التي يغطّيها** (`ق-٤٧٥/②`).
 *
 * **ولماذا تُخزَّن ولا تُشتقّ**: اشتقاقُها ممكنٌ اليوم من `dueDate` والدورة —
 * **لكنه يكذب متى عُدِّلت الدورةُ أو المدةُ بعد التوليد**، فيعيد كتابة تاريخِ
 * خدمةٍ لقيدٍ مُرحَّل (`ق-١٢٧`). **فالفترةُ تُثبَّت لحظةَ التوليد.**
 */
export interface ScheduledInstallment {
  dueDate: Date;
  amount: number;
  /**
   * أوّلُ يومٍ في الفترة التي يغطّيها القسط — **وهو تاريخُ استحقاقه نفسُه**.
   *
   * ⭐ **وهذا هو المحدِّد كلُّه** (`ق-٤٧٤`): القسطُ يستحقّ في **أوّلِ** فترته لا
   * في آخرها، **فكلُّ قبضِ إيجارٍ قبضٌ عن خدمةٍ لم تُقدَّم بعد** — بالبناء لا
   * بالصدفة. **ولا يلزم عقدٌ ربعيٌّ ولا سنويّ ليقع الخطأ.**
   */
  serviceStart: Date;
  /** آخرُ يومٍ فيها — اليومُ الذي يسبق القسطَ التالي، أو نهايةُ العقد للأخير. */
  serviceEnd: Date;
}

/** اليومُ السابق — والحسابُ بالتقويم المحلّي كبقيّة هذا الملفّ. */
function dayBefore(d: Date): Date {
  const out = new Date(d);
  out.setDate(out.getDate() - 1);
  return out;
}

/** Splits `value` evenly across installments stepped by `cycle`, with any
 * rounding remainder absorbed into the last installment — matches the
 * mockup's `generateInstallments`. Installment count is derived from the
 * contract's total duration in months (approximated via a 30.44-day month,
 * same as the mockup) divided by the cycle's step. */
export function generateInstallmentSchedule(start: Date, end: Date, value: number, cycle: string): ScheduledInstallment[] {
  const stepMonths = CYCLE_STEP_MONTHS[cycle] ?? 1;
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const totalMonths = Math.max(1, Math.round(totalDays / 30.44));
  const count = Math.max(1, Math.round(totalMonths / stepMonths));

  // التوزيع من المحرّك: المجموع يساوي قيمة العقد بالضبط، والفرق على القسط
  // الأخير وحده. وكان هنا `Math.floor((value / count) * 100) / 100` — فعقدٌ بـ
  // `3.03` على ثلاثة يعطي `1.00 · 1.00 · 1.03` بدل `1.01` ثلاثاً، لأن
  // `3.03/3 × 100` يساوي `100.99999999999999`. راجع `common/money/allocation.ts`.
  const amounts = allocateEvenly(value, count);

  const dueDates: Date[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < count; i++) {
    dueDates.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + stepMonths);
  }

  return dueDates.map((dueDate, i) => {
    const next = dueDates[i + 1];
    // آخرُ قسطٍ ينتهي بنهاية العقد لا بخطوةٍ إضافية — **كما يبتلع الأخيرُ باقيَ
    // التقريب في المبلغ**، يبتلع باقيَ المدة. فعددُ الأقساط مقرَّبٌ (`round`)،
    // وخطوةٌ سادسةٌ على عقدٍ مدّتُه خمسةٌ ونصف تمتدّ خارج العقد.
    const periodEnd = next ? dayBefore(next) : new Date(end);
    return {
      dueDate,
      amount: amounts[i],
      serviceStart: new Date(dueDate),
      // فترةٌ مقلوبة لا تُكتب: عقدٌ فرَط تقريبُه يعطي بدايةً بعد نهايته،
      // **ويومٌ واحد أصدقُ من مدىً سالبٍ يقسم عليه المحرّك**.
      serviceEnd: periodEnd < dueDate ? new Date(dueDate) : periodEnd,
    };
  });
}
