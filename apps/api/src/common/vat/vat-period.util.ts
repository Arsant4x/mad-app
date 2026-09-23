/**
 * ⑥A2 (`ق-١٣٢٥`) — **الفترةُ الضريبية: عدسةٌ لا بوّابة.**
 *
 * اللائحةُ التنفيذية · مادّةُ الفترة الضريبية:
 *   ف١ «For Taxpayers whose annual value of Taxable Supplies exceeds forty million
 *       (40,000,000) SAR **during the previous twelve months**, the Tax Period shall be monthly»
 *   ف٢ «For all other Taxpayers, the standard Tax Period shall be three months»
 *   ف٣–ف٧ الطلبُ والموافقةُ والإشعار — **وتسري من بداية الفترة التالية للموافقة**.
 *
 * ⚠️ **ولماذا لا يحجب الإعدادُ ما يُطلَب**: الفترةُ تتغيّر بإشعارٍ له تاريخُ سريان، فتاجرٌ
 * انتقل إلى الشهرية في منتصف السنة **قدّم أرباعاً قبلها**. فلو كان الإعدادُ بوّابةً لحُجبت
 * عنه أرباعُه المقدَّمة — **ومنعُ التاجر من قراءة ما قدّمه عطلٌ لا حراسة**. فالمحرّكُ يحسب
 * أيَّ فترةٍ تُطلَب، **والإعلانُ في الردّ** يقول أتطابق فترتَه أم لا.
 */

/** حدُّ الإلزام بالفترة الشهرية — أربعون مليوناً من التوريدات الخاضعة خلال اثني عشر شهراً. */
export const MONTHLY_PERIOD_THRESHOLD = 40_000_000;

export type VatPeriodType = 'QUARTERLY' | 'MONTHLY';

export interface ResolvedVatPeriod {
  periodType: VatPeriodType;
  /** `1..4` للربع · `1..12` للشهر. */
  periodNo: number;
  year: number;
  /** أوّلُ يومٍ في الفترة — `UTC` منتصفَ الليل، كما تُخزَّن تواريخُ المستندات (`@db.Date`). */
  from: Date;
  /** آخرُ يومٍ في الفترة. */
  to: Date;
  /** نصٌّ للعرض وللرسائل — «الربع 2 من 2026» · «شهر 7 من 2026». */
  label: string;
}

const QUARTER_MONTHS: Record<number, [number, number]> = { 1: [1, 3], 2: [4, 6], 3: [7, 9], 4: [10, 12] };

function range(year: number, startMonth: number, endMonth: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, startMonth - 1, 1)),
    // اليومُ صفر من الشهر التالي = آخرُ يومٍ في `endMonth` — فلا جدولَ لأطوال الشهور ولا كبيسة.
    to: new Date(Date.UTC(year, endMonth, 0)),
  };
}

/**
 * يحلّ الفترةَ المطلوبة. **أحدُهما لا كلاهما ولا واحدَ**: الرفضُ من الـDTO بالرسالة،
 * وهذه ترمي إن بلغها المستحيل (مسارٌ لا يمرّ بالـDTO) فلا تُرجع فترةً مخترَعة.
 */
export function resolveVatPeriod(query: { year: number; quarter?: number; month?: number }): ResolvedVatPeriod {
  const { year, quarter, month } = query;
  if (month !== undefined) {
    if (quarter !== undefined) throw new Error('vat period: both quarter and month supplied');
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error(`vat period: month out of range (${month})`);
    return { periodType: 'MONTHLY', periodNo: month, year, ...range(year, month, month), label: `شهر ${month} من ${year}` };
  }
  if (quarter === undefined) throw new Error('vat period: neither quarter nor month supplied');
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) throw new Error(`vat period: quarter out of range (${quarter})`);
  const [startMonth, endMonth] = QUARTER_MONTHS[quarter];
  return { periodType: 'QUARTERLY', periodNo: quarter, year, ...range(year, startMonth, endMonth), label: `الربع ${quarter} من ${year}` };
}

/** الاثنا عشر شهراً المنتهية بنهاية الفترة — نافذةُ قياس حدّ الأربعين مليوناً (ف١: «during the previous twelve months»). */
export function trailingTwelveMonths(period: ResolvedVatPeriod): { from: Date; to: Date } {
  const to = period.to;
  // اليومُ التالي قبل اثني عشر شهراً: نافذةٌ مغلقةٌ من الطرفين طولُها سنة.
  const from = new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), to.getUTCDate() + 1));
  return { from, to };
}

/** السنةُ التقويمية بكاملها — مقامُ الخصم النسبيّ ونطاقُ تسويته (م٥١/٤–٧). */
export function calendarYear(year: number): { from: Date; to: Date } {
  return range(year, 1, 12);
}

/** أهي آخرُ فترةٍ في السنة التقويمية؟ — فيها تقع تسويةُ الخصم النسبيّ (م٥١/٧). */
export function isLastPeriodOfYear(period: ResolvedVatPeriod): boolean {
  return period.periodType === 'MONTHLY' ? period.periodNo === 12 : period.periodNo === 4;
}

/** الفترةُ السابقة لهذه — منها يُرحَّل الرصيدُ المستردّ (⑥A3). */
export function previousVatPeriod(period: ResolvedVatPeriod): ResolvedVatPeriod {
  if (period.periodNo > 1) return resolveVatPeriod(periodQuery(period.periodType, period.year, period.periodNo - 1));
  const last = period.periodType === 'MONTHLY' ? 12 : 4;
  return resolveVatPeriod(periodQuery(period.periodType, period.year - 1, last));
}

function periodQuery(periodType: VatPeriodType, year: number, periodNo: number): { year: number; quarter?: number; month?: number } {
  return periodType === 'MONTHLY' ? { year, month: periodNo } : { year, quarter: periodNo };
}
