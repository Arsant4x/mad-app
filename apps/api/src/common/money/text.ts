import { Prisma } from '@prisma/client';
import { RoundingContext, SCALE, roundTo } from './rounding';

/**
 * **المالُ نصّاً بدقّة صنفه** (`ق-١٢٣٥`) — طلبُ وكيل الواجهة ② بصياغة المالك: لا «خانتان ثابتتان» بل
 * **الدقّةُ صفةُ الصنف**: مالٌ `2` · كمّيةٌ `3` · سعرُ صرفٍ `6` · نسبةٌ `2` — من جدول التدوير المركزي لا رقمٌ يُكتب هنا.
 *
 * لماذا نصّ: `JSON` يحمل الرقمَ ثنائياً، فـ`0.1 + 0.2` في المتصفّح `0.30000000000000004`؛ والنصُّ يحمل الخاناتِ
 * كما دوّرها الخادمُ بسياسته الواحدة (`roundTo` — نصفٌ بعيداً عن الصفر على القيمة العشرية). ولماذا بالصنف: الكمّيةُ
 * `0.125` كيلو بخانتين تصير `0.13` **وتُفسد جمعَ الحركات** (`L0-4`).
 *
 * والمدخلُ يقبل ما تعيده القاعدة (`Prisma.Decimal` — نصٌّ أصلاً) وما يحسبه الخادم (`number`) ونصّاً رقمياً؛
 * **والغائبُ (`null`/`undefined`) يبقى `null`** — فالقرارُ في كل موضعٍ للمستدعي (`ق-١٢٣٥`/④): مجموعُ مصفوفةٍ
 * فارغة صفرٌ صحيح يُمرَّر `0`، وسعرٌ لم يُعلَن غيابٌ يُمرَّر `null`.
 *
 * ⚠️ `NaN` و`±Infinity` **تُردّ خطأً لا نصّاً**: قيمةٌ فاسدة تصير `"NaN"` في الحقل ثم تمرّ إلى شاشةٍ وتُقرأ
 * رقماً — وهو ما بُني هذا الملفُّ لمنعه. ولا صفرَ سالب (`-0.00`).
 *
 * والهجرةُ **بالنطاق** (`ق-١٢٣٥`/②): كلُّ نطاقٍ طلبٌ يحمل الخادمَ والواجهةَ واختباراتِها معاً — أوّلُها الإقرارُ الضريبيّ.
 */
export type NumericInput = number | string | Prisma.Decimal | null | undefined;

export type TextKind = 'money' | 'quantity' | 'rate' | 'percent';

/** سياقُ التدوير لكلِّ صنفٍ — والدقّةُ تُقرأ من `SCALE` عبره. */
const CONTEXT_OF: Record<TextKind, RoundingContext> = {
  money: 'INVOICE_TOTAL',
  quantity: 'DERIVED_QUANTITY',
  rate: 'EXCHANGE_RATE',
  percent: 'PERCENT',
};

/** دقّةُ كلِّ صنف — مشتقّةٌ من جدول التدوير. */
export const TEXT_SCALE: Record<TextKind, number> = {
  money: SCALE[CONTEXT_OF.money],
  quantity: SCALE[CONTEXT_OF.quantity],
  rate: SCALE[CONTEXT_OF.rate],
  percent: SCALE[CONTEXT_OF.percent],
};

function toNumber(value: NumericInput): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    return Number(trimmed);
  }
  return value.toNumber();
}

/** النصُّ بدقّة الصنف — أو `null` للغائب. */
export function numericText(value: NumericInput, kind: TextKind): string | null {
  const n = toNumber(value);
  if (n === null) return null;
  if (!Number.isFinite(n)) throw new TypeError(`قيمةٌ غيرُ منتهية لا تُكتب نصّاً (${kind}): ${String(value)}`);
  // التدويرُ بالسياسة أولاً ثم `toFixed` على المدوَّر — فلا يمرّ `toFixed` وحده على قيمةٍ خام (كنسةُ التدوير 2026-09-03).
  const text = roundTo(n, CONTEXT_OF[kind]).toFixed(TEXT_SCALE[kind]);
  return text.startsWith('-') && Number(text) === 0 ? text.slice(1) : text;
}

/** مبلغٌ بخانتين — `"1234.50"`؛ والغائبُ `null`. */
export const moneyText = (value: NumericInput): string | null => numericText(value, 'money');
/** كمّيةٌ بثلاث — `"0.125"`؛ والغائبُ `null`. */
export const qtyText = (value: NumericInput): string | null => numericText(value, 'quantity');
/** سعرُ صرفٍ بستّ — `"3.750000"`؛ والغائبُ `null`. */
export const rateText = (value: NumericInput): string | null => numericText(value, 'rate');
/** نسبةٌ مئوية بخانتين — `"15.00"`؛ والغائبُ `null`. */
export const percentText = (value: NumericInput): string | null => numericText(value, 'percent');

/** الصيغةُ الواجبة — لقيمةٍ محسوبةٍ حاضرة (مجموعٌ صفرُه صحيح): الغائبُ هنا خطأٌ لا `null`. */
function requiredText(value: number | string | Prisma.Decimal, kind: TextKind): string {
  const text = numericText(value, kind);
  if (text === null) throw new TypeError(`قيمةٌ واجبةٌ غائبة (${kind})`);
  return text;
}
export const money = (value: number | string | Prisma.Decimal): string => requiredText(value, 'money');
export const qty = (value: number | string | Prisma.Decimal): string => requiredText(value, 'quantity');
