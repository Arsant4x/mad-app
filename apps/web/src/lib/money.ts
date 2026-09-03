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
