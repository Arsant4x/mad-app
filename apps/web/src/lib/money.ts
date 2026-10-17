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

/** A number as the decimal it is written as (its shortest round trip text): whole units and a count of places. */
function exactDecimal(value: number): { units: bigint; places: number } {
  const [mantissa, exponent = '0'] = String(value).split('e');
  const negative = mantissa.startsWith('-');
  const [whole, fraction = ''] = (negative ? mantissa.slice(1) : mantissa).split('.');
  const places = fraction.length - Number(exponent);
  const digits = BigInt(whole + fraction);
  const units = places < 0 ? digits * 10n ** BigInt(-places) : digits;
  return { units: negative ? -units : units, places: Math.max(places, 0) };
}

/** a × b ÷ 10^shift on the exact decimals, rounded once: the server's roundExactProduct. */
function roundExactProduct(a: number, b: number, shift: number, scale: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return roundMoney((a * b) / 10 ** shift, scale);
  const x = exactDecimal(a);
  const y = exactDecimal(b);
  const product = x.units * y.units;
  const places = x.places + y.places + shift;
  const magnitude = product < 0n ? -product : product;
  let rounded: bigint;
  if (places <= scale) {
    rounded = magnitude * 10n ** BigInt(scale - places);
  } else {
    const divisor = 10n ** BigInt(places - scale);
    rounded = magnitude / divisor;
    if (2n * (magnitude % divisor) >= divisor) rounded += 1n;
  }
  if (rounded === 0n) return 0;
  return Number(`${product < 0n ? '-' : ''}${rounded}e-${scale}`);
}

/** a × b rounded once on the exact decimal, the server's roundProduct: 0.375 × 0.6 gives 0.23, not the binary 0.22. */
export function roundProduct(a: number, b: number, scale = 2): number {
  return roundExactProduct(a, b, 0, scale);
}

/**
 * percent% of amount rounded once on the exact decimal, the server's roundPercentOf
 * (apps/api/src/common/money/rounding.ts): 100.30 at 15% is 15.045 and gives 15.05, not the binary 15.04.
 */
export function roundPercentOf(amount: number, percent: number, scale = 2): number {
  return roundExactProduct(amount, percent, 2, scale);
}

export interface DocumentLine {
  quantity: number;
  unitPrice: number;
  discount?: number | null;
  taxRate: number;
  taxCategory?: string | null;
  taxExemptionReasonCode?: string | null;
  taxExemptionReason?: string | null;
}

/**
 * A document's totals as the server stores them, the web copy of computeDocumentTotals
 * (apps/api/src/common/money/totals.ts): each line net rounded, and the tax per category, rate and reason
 * on the sum of its nets, never the sum of the line taxes.
 */
export function documentTotals(lines: readonly DocumentLine[]): { subtotal: number; tax: number; total: number } {
  let subtotal = 0;
  const buckets = new Map<string, { rate: number; taxable: number }>();
  for (const line of lines) {
    const net = round2(roundProduct(line.quantity, line.unitPrice) - round2(Number(line.discount ?? 0)));
    subtotal = round2(subtotal + net);
    const declared = line.taxCategory;
    const category =
      declared === 'S' || declared === 'LEGACY_STANDARD'
        ? 'S'
        : declared === 'Z' || declared === 'E' || declared === 'O' || declared === 'LEGACY_ZERO'
          ? declared
          : line.taxRate > 0
            ? 'S'
            : 'Z';
    const reasonCode = category === 'S' || category === 'LEGACY_ZERO' ? null : (line.taxExemptionReasonCode ?? null);
    const reasonText = category === 'O' ? (line.taxExemptionReason ?? null) : null;
    const key = `${category}|${line.taxRate}|${reasonCode ?? ''}|${reasonText ?? ''}`;
    const bucket = buckets.get(key) ?? { rate: line.taxRate, taxable: 0 };
    bucket.taxable = round2(bucket.taxable + net);
    buckets.set(key, bucket);
  }
  const tax = [...buckets.values()].reduce((sum, b) => round2(sum + roundPercentOf(b.taxable, b.rate)), 0);
  return { subtotal, tax, total: round2(subtotal + tax) };
}

/**
 * The totals the server stores for a document taxed on its net as one amount (a purchase or a supplier
 * note): the server's computeNetTotals, so a preview shows the stored numbers.
 */
export function netTotals(net: number, taxRate: number): { subtotal: number; tax: number; total: number } {
  const subtotal = round2(net);
  const tax = roundPercentOf(subtotal, taxRate);
  return { subtotal, tax, total: round2(subtotal + tax) };
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
