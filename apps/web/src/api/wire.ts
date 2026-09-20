/**
 * أنواعُ السلك الموسومة — القاعدتان ① و③ من `docs/ui/rounds/01-rules-enforcement.md`.
 *
 * ## لماذا وسمٌ على نصّ لا `number`
 *
 * المبلغُ يصل من الخادم **نصّاً عشرياً** (`"1234.50"` — `Decimal(18,2)` في المخطّط).
 * لو صار `number` في الواجهة لصار **قابلاً للجمع والطرح في الشاشة** — وهذا بعينه
 * ما أنتج «مسدَّدٌ صفر ورصيدٌ ألف» في بطاقة العميل بينما الخادم يرسل `outstanding`
 * (`CustomerDetailModal.tsx:11-17` — المراجعة الخارجية ج٤ §١.١).
 *
 * والوسمُ يجعل الحسابَ **خطأَ ترجمة** لا مخالفةَ أسلوب: `total * 2` على `Money`
 * يُرفض (`TS2362`)، و`<MoneyCell>` لا يقبل `number` أصلاً. وما يبقى ممكناً
 * تركيبياً (`Number(x)` · `x + y` تسلسلاً) يمسكه حارسُ الشجرة
 * (`guards/rules.guard.test.ts` — ①).
 *
 * ## أين يُطبَّع
 *
 * **هنا وحده** (`toMoney`). الخادمُ اليوم يرسل المالَ بصيغتين — نصّاً للمخزَّن ورقماً
 * للمحسوب (`api/invoices.ts:56` `outstanding: number`) — فحتى يوحّدها (بندٌ معلَنٌ له
 * في الجولة ٢ «لحكمك ١») يمرّ الرقمُ من هذا الباب الواحد ويخرج نصّاً موسوماً.
 * ⚠️ لا تطبيعَ في نداءٍ آخر (شرطُ المالك 2026-09-20: «موضعٌ واحدٌ يطبّع»).
 */

declare const moneyBrand: unique symbol;
declare const qtyBrand: unique symbol;

/** مبلغٌ كما على السلك: نصٌّ عشريّ بخانتين. لا يُجمع ولا يُطرح في الشاشة. */
export type Money = string & { readonly [moneyBrand]: 'Money' };

/** كمّيةٌ كما على السلك: نصٌّ عشريّ. لا تُجمع في الشاشة. */
export type Qty = string & { readonly [qtyBrand]: 'Qty' };

/**
 * عددٌ لأشياء يرسله الخادم (عدد الصفوف · عدد الصفحات). **حقيقةٌ عن العمل** حين
 * يُعرض رقماً (٤٢ عقداً) — فلا يُجمع في الشاشة هو أيضاً (تشديد المالك 2026-09-20:
 * «يُمنع الحسابُ على كلِّ رقمٍ يُقرأ حقيقةً عن العمل»). ما يُسمح به عليه **حسابُ
 * آليّة العرض وحدها** — عددُ الصفحات في `Pager` — وهو الملفُّ الوحيد المأذون له.
 */
export type Count = number;

/** الحدُّ الأدنى لما يُعدّ نصّاً عشرياً صالحاً: علامةٌ اختيارية، أرقام، وكسرٌ اختياري. */
const DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * الموضعُ الوحيد الذي يحوّل ما يصل من الخادم إلى `Money`.
 *
 * - `null`/`undefined` تبقى `null` — **الغائبُ لا يصير صفراً** (③).
 * - رقمٌ (المحسوبُ في الخادم اليوم) يُثبَّت بخانتين نصّاً.
 * - نصٌّ لا يشبه عشرياً **يُرمى** لا يُطبَّع: شكلٌ غيرُ متوقَّع من الخادم عطلٌ يُقرأ،
 *   لا قيمةٌ تُخفى.
 */
export function toMoney(raw: string | number | null | undefined): Money | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) throw new Error(`toMoney: قيمةٌ غير منتهية من الخادم: ${String(raw)}`);
    return raw.toFixed(2) as Money;
  }
  const s = raw.trim();
  if (!DECIMAL.test(s)) throw new Error(`toMoney: نصٌّ ليس مبلغاً: «${s}»`);
  return s as Money;
}

/** نظيرُ `toMoney` للكمّيات. */
export function toQty(raw: string | number | null | undefined): Qty | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) throw new Error(`toQty: قيمةٌ غير منتهية من الخادم: ${String(raw)}`);
    return String(raw) as Qty;
  }
  const s = raw.trim();
  if (!DECIMAL.test(s)) throw new Error(`toQty: نصٌّ ليس كمّية: «${s}»`);
  return s as Qty;
}
