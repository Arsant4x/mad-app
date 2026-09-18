/**
 * وحداتُ القياس المرمَّزة — ① (ق-١٠٦٩).
 *
 * كانت وحدةُ الصنف **نصّاً حرّاً** (`Product.unit`) لا يقرؤه أحد، ومستندُ الهيئة يرسل
 * `unitCode="PCE"` ثابتاً لكلِّ سطر. صارت الوحدةُ **رمزاً يُعلَن من قائمةٍ مغلقة**:
 * رموزُ UN/ECE Recommendation 20 — وهي التي «يُوصى» بها في قاموس بيانات الهيئة
 * (الصفّ 109، `BT-130`، `0..1`، اختياريٌّ لكلِّ أنواع الفواتير: «Units of measurement
 * code are recommended to be from UN/ECE Recommendation 20, Revision 16 (2020)»).
 * ورموزُ التعبئة (صندوق · كرتون · عبوة …) هي رموزُ التوصية 21 كما أُدرجت في التوصية 20
 * بسابقة `X`. كلُّ رمزٍ هنا **قُرئ من القائمة المنشورة** (Peppol BIS Billing 3.0،
 * قائمة `UNECERec20`، Revision 11e) لا من الذاكرة.
 *
 * ⚠️ «قطعة» هي `H87` في التوصية 20؛ ومثالُ الهيئة في قاموسها `PCE` — رمزٌ **غيرُ موجود**
 * في القائمة التي توصي بها. اختير `H87` لأنه في القائمة الموصى بها؛ وما لم يُعلَن للصنف
 * رمزٌ **لا يُرسَل رمزٌ أصلاً** (السمةُ اختيارية) — لا `PCE` صامتاً كما كان.
 *
 * القائمةُ مغلقةٌ عمداً: الوحدةُ **تُعلَن** من هنا ولا تُكتب نصّاً، وتُوسَّع بحكمٍ لا بإدخالٍ
 * حرّ. ونسخةُ الواجهة `apps/web/src/lib/units.ts` يحرس تطابقَها `units.spec.ts`.
 */
export interface UnitOfMeasure {
  /** رمزُ التوصية 20 كما يُرسَل في `cbc:InvoicedQuantity/@unitCode`. */
  code: string;
  ar: string;
  /** الاسمُ كما في القائمة المنشورة. */
  en: string;
}

export const UNITS_OF_MEASURE: readonly UnitOfMeasure[] = [
  { code: 'H87', ar: 'قطعة', en: 'piece' },
  { code: 'C62', ar: 'وحدة', en: 'one' },
  { code: 'KGM', ar: 'كيلوغرام', en: 'kilogram' },
  { code: 'GRM', ar: 'غرام', en: 'gram' },
  { code: 'TNE', ar: 'طنّ', en: 'tonne (metric ton)' },
  { code: 'LTR', ar: 'لتر', en: 'litre' },
  { code: 'MLT', ar: 'مليلتر', en: 'millilitre' },
  { code: 'MTR', ar: 'متر', en: 'metre' },
  { code: 'CMT', ar: 'سنتيمتر', en: 'centimetre' },
  { code: 'MTK', ar: 'متر مربّع', en: 'square metre' },
  { code: 'MTQ', ar: 'متر مكعّب', en: 'cubic metre' },
  { code: 'HUR', ar: 'ساعة', en: 'hour' },
  { code: 'DAY', ar: 'يوم', en: 'day' },
  { code: 'MON', ar: 'شهر', en: 'month' },
  { code: 'SET', ar: 'طقم', en: 'set' },
  { code: 'PR', ar: 'زوج', en: 'pair' },
  { code: 'DZN', ar: 'دزينة', en: 'dozen' },
  { code: 'XBX', ar: 'صندوق', en: 'box' },
  { code: 'XCT', ar: 'كرتون', en: 'carton' },
  { code: 'XPK', ar: 'عبوة', en: 'package' },
  { code: 'XBG', ar: 'كيس', en: 'bag' },
  { code: 'XBO', ar: 'زجاجة', en: 'bottle' },
  { code: 'XCA', ar: 'علبة', en: 'can' },
];

const CODES: ReadonlySet<string> = new Set(UNITS_OF_MEASURE.map((u) => u.code));

/** رمزٌ من القائمة المغلقة — لا غير. */
export function isUnitCode(value: unknown): value is string {
  return typeof value === 'string' && CODES.has(value);
}

export function unitLabel(code: string | null | undefined, lang: 'ar' | 'en' = 'ar'): string | null {
  if (!code) return null;
  const unit = UNITS_OF_MEASURE.find((u) => u.code === code);
  return unit ? unit[lang] : null;
}
