import { allocateByWeights } from '../common/money/allocation';
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

const DAY_MS = 86_400_000;

/** The UTC day of `d`: contract dates are `@db.Date` days, so the schedule is computed on UTC days. */
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

/** `months` calendar months after `from`, the day held to the last day of a shorter month (31 January + 1 is 28 or 29 February). */
function addMonthsClamped(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(from.getUTCDate(), lastDay)));
}

/**
 * The calendar months between month `fromMonth` of the schedule and `endExclusive`: the whole months, plus the
 * days left over as a share of the month they fall in.
 */
function monthsCovered(anchor: Date, fromMonth: number, endExclusive: Date): number {
  let whole = 0;
  while (addMonthsClamped(anchor, fromMonth + whole + 1).getTime() <= endExclusive.getTime()) whole++;
  const monthStart = addMonthsClamped(anchor, fromMonth + whole);
  const monthEnd = addMonthsClamped(anchor, fromMonth + whole + 1);
  const extraDays = (endExclusive.getTime() - monthStart.getTime()) / DAY_MS;
  return whole + extraDays / ((monthEnd.getTime() - monthStart.getTime()) / DAY_MS);
}

/**
 * The installment schedule of a contract. The count is the duration in months (a 30.44 day month, rounded)
 * divided by the cycle's step and rounded. Each installment falls due on the first day of its period, counted
 * from the contract start. Each is sized by the months it covers: a full step for all but the last, which takes
 * its whole months plus the share of a month its extra days make. The amounts add up to `value`, the remainder
 * on the last installment.
 */
export function generateInstallmentSchedule(start: Date, end: Date, value: number, cycle: string): ScheduledInstallment[] {
  const stepMonths = CYCLE_STEP_MONTHS[cycle] ?? 1;
  const first = utcDay(start);
  const last = utcDay(end);
  const totalDays = Math.max(1, (last.getTime() - first.getTime()) / DAY_MS);
  const totalMonths = Math.max(1, Math.round(totalDays / 30.44));
  const count = Math.max(1, Math.round(totalMonths / stepMonths));

  // Each due date is counted from the start, not from the one before, so a month end start does not drift.
  const dueDates = Array.from({ length: count }, (_, i) => addMonthsClamped(first, i * stepMonths));

  const periods = dueDates.map((dueDate, i) => {
    const next = dueDates[i + 1];
    // The last installment runs to the contract end, which the rounded count can put short of or past a full step.
    const periodEnd = next ? addDays(next, -1) : last;
    // An inverted period is never written: one day is truer than a negative span the revenue engine divides by.
    return { dueDate, serviceEnd: periodEnd.getTime() < dueDate.getTime() ? dueDate : periodEnd };
  });

  const weights = periods.map((p, i) => (i < count - 1 ? stepMonths : monthsCovered(first, i * stepMonths, addDays(p.serviceEnd, 1))));
  const amounts = allocateByWeights(value, weights);

  return periods.map((p, i) => ({
    dueDate: new Date(p.dueDate),
    amount: amounts[i],
    serviceStart: new Date(p.dueDate),
    serviceEnd: new Date(p.serviceEnd),
  }));
}
