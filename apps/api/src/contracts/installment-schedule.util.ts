import { allocateEvenly } from '../common/money/allocation';
const CYCLE_STEP_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

/** Splits `value` evenly across installments stepped by `cycle`, with any
 * rounding remainder absorbed into the last installment — matches the
 * mockup's `generateInstallments`. Installment count is derived from the
 * contract's total duration in months (approximated via a 30.44-day month,
 * same as the mockup) divided by the cycle's step. */
export function generateInstallmentSchedule(start: Date, end: Date, value: number, cycle: string): { dueDate: Date; amount: number }[] {
  const stepMonths = CYCLE_STEP_MONTHS[cycle] ?? 1;
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const totalMonths = Math.max(1, Math.round(totalDays / 30.44));
  const count = Math.max(1, Math.round(totalMonths / stepMonths));

  // التوزيع من المحرّك: المجموع يساوي قيمة العقد بالضبط، والفرق على القسط
  // الأخير وحده. وكان هنا `Math.floor((value / count) * 100) / 100` — فعقدٌ بـ
  // `3.03` على ثلاثة يعطي `1.00 · 1.00 · 1.03` بدل `1.01` ثلاثاً، لأن
  // `3.03/3 × 100` يساوي `100.99999999999999`. راجع `common/money/allocation.ts`.
  const amounts = allocateEvenly(value, count);
  const schedule: { dueDate: Date; amount: number }[] = [];
  const dueDate = new Date(start);

  for (let i = 0; i < count; i++) {
    schedule.push({ dueDate: new Date(dueDate), amount: amounts[i] });
    dueDate.setMonth(dueDate.getMonth() + stepMonths);
  }

  return schedule;
}
