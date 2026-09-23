/**
 * التدوير العشري الصحيح في الواجهة — **نفس سياسة الخادم** (`apps/api/src/common/money/rounding.ts`):
 * نصفٌ بعيداً عن الصفر، على القيمة العشرية لا الثنائية.
 *
 * لماذا في الواجهة أيضاً (كنسة التدوير — قرار المالك 2026-09-03): كانت شاشات التخصيص
 * والتقسيم والمشتريات تحسب بـ`Math.round(x * 100) / 100` — فيرى المحاسب `1.00` والخادم
 * يحسب `1.01`، ويُرسَل تقسيمٌ نقدي/بطاقة لا يساوي إجمالي الخادم بهللة فيُرفض.
 *
 * الإزاحة عبر النصّ (`Number('1.005e2') === 100.5`) تتجاوز حدّ IEEE-754 الذي يجعل
 * `1.005 * 100 === 100.49999999999999`.
 */
function shiftDecimal(value: number, places: number): number {
  const [mantissa, exponent = '0'] = String(value).split('e');
  return Number(`${mantissa}e${Number(exponent) + places}`);
}

export function roundMoney(value: number, scale = 2): number {
  if (!Number.isFinite(value)) return value;
  const magnitude = shiftDecimal(Math.round(shiftDecimal(Math.abs(value), scale)), -scale);
  if (magnitude === 0) return 0;
  return value < 0 ? -magnitude : magnitude;
}

/** المبالغ: خانتان. */
export const round2 = (value: number): number => roundMoney(value, 2);

/** نصُّ المبلغ بعد التدوير بالسياسة — لا `toFixed` على قيمةٍ خام. */
export function formatMoney(value: number, scale = 2): string {
  return roundMoney(value, scale).toFixed(scale);
}

// ─── ② المالُ نصّاً بدقّة صنفه (`ق-١٢٣٥`) — مرآةُ الأنواع وقراءتُها ─────────────────────────────

/**
 * **نصٌّ عشريّ بدقّة صنفه يأتي من الخادم** — `"1234.50"` للمال · `"0.125"` للكمّية · `"3.750000"` لسعر الصرف
 * · `"15.00"` للنسبة (`apps/api/src/common/money/text.ts`). الأسماءُ أسماءُ أصنافٍ لا شكل: الحارسُ الشجريّ
 * (`moneyTextGuard.test.ts`) يقرأ **الاسمَ المُعلَن على الحقل** فيُسقط أيَّ `+` أو مقارنةٍ عليه — لأن
 * `"100.00" + "50.00"` وصلٌ لا جمع، و`"9.00" > "10.00"` مقارنةُ حروف. فالحقلُ **يُقرأ بـ`num()` قبل أي حساب**،
 * ويُعرض بـ`fmt()` كما هو (تقبل النصّ).
 */
export type MoneyText = string;
export type QtyText = string;
export type RateText = string;
export type PercentText = string;

/** يقرأ النصَّ العشريَّ رقماً — والغائبُ (`null`) والفارغُ والفاسدُ تعود `null` لا صفراً: الصفرُ قرارُ المستدعي. */
export function num(text: MoneyText | QtyText | RateText | PercentText | number | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** كالسابقة والغائبُ صفر — للمجاميع والمقارنات التي صفرُها صحيح. */
export const num0 = (text: MoneyText | QtyText | RateText | PercentText | number | null | undefined): number => num(text) ?? 0;

/** مجموعُ نصوصٍ مالية مدوَّراً بالسياسة — فلا يتراكم خطأُ الجمع الثنائي على صفوفٍ كثيرة. */
export function sumMoney(values: readonly (MoneyText | number | null | undefined)[]): number {
  return round2(values.reduce<number>((s, v) => s + num0(v), 0));
}

/**
 * ⑥A1 (`ق-١٣٢٥`) — **كسرٌ يُعرض نسبةً مئوية**: `0.666667` ⟵ `«66.67%»`.
 *
 * ⚠️ **ومكانُها هنا لا في الشاشة**: الشاشةُ كانت تكتب `(r * 100).toFixed(2)` فأسقطها حارسُ
 * كنسة التدوير — **وهو محقّ وإن لم تكن نسبةً مالاً**: ما يُدوَّر بيدٍ في شاشةٍ يُكرَّر في
 * أخرى بصياغةٍ تختلف، فتفترق نسبةُ الإقرار عن نسبة البطاقة. **فمصدرٌ واحد**.
 */
export function pct(ratio: number | null | undefined, digits = 2): string {
  const n = num(ratio ?? null);
  if (n === null) return '—';
  const scaled = Math.round(n * 100 * 10 ** digits) / 10 ** digits;
  return `${scaled.toFixed(digits)}%`;
}
