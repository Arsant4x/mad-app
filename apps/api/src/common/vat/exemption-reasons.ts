/**
 * ⑧ أسبابُ الإعفاء والصفر والاستثناء — **قائمةُ الهيئة المغلقة** (`ق-١٢١٢`).
 *
 * الرموزُ والنصوصُ العربية **قُرئت من الجدول المصوَّر** في معيار تطبيق XML للفاتورة الإلكترونية
 * — الإصدار 1.2 (2023-05-19)، §11.2.4 ص٣٢–٣٣ — من كتالوج الهيئة لا من محرّك بحث (`§3.6`/①؛
 * الموجز §٢-ب). و`BR-KSA-CL-04`: «If VAT category Code (BT-118) is 'Z', or 'E' or 'O', VAT
 * exemption (or exception) reason code (BT-121) must exist with one of the values from paragraph
 * 11.2.4». والنصُّ الإنجليزي كما في المعيار؛ **والعربي هو المعتمَد عند الاختلاف**.
 *
 * ⚠️ القائمةُ **بياناتٌ مرجعيّة للمنصّة** تُحدَّث مع إصدارات المعيار — لا قائمةً يكتبها كلُّ تاجر
 * (`§3.5`: القوالبُ العامّة عند مدير المنصّة). التاجرُ **يختار** منها ولا يكتب رمزاً.
 *
 * ⛔ **حدٌّ معلَن** (`ق-١٢١١`/② · `ق-١٢٢٣`): `VATEX-SA-EDU` و`VATEX-SA-HEA` **تابعان للمشتري** لا
 * للصنف — فاتورةٌ لمواطنٍ برقم هويّته بعد التحقّق، وتدخل الخانةَ `2` من الإقرار («المبيعات
 * للمواطنين» — دليلُ الإقرار المبسّط 2023م ص13). لا يُعرضان للاختيار حتى الجلسة الميدانية،
 * والخانةُ `2` تبقى صفراً معلَناً — لا تُترك في `3`.
 *
 * وخانةُ الإقرار لكلِّ رمزٍ اشتقاقٌ من جدول §٢-د في الموجز: الصادراتُ (`32` · `33`) الخانةُ `4`،
 * وسائرُ الصفر المحليّ الخانةُ `3`، والمعفى الخانةُ `5`، وخارجُ النطاق لا يدخل الإقرار.
 */

export type ExemptionCategory = 'Z' | 'E' | 'O';

/** خاناتُ المبيعات في نموذج الإقرار — `2` تابعةٌ للمشتري (غيرُ مدعومة)، و`null` = خارج الإقرار. */
export type DeclarationBox = 2 | 3 | 4 | 5 | null;

export interface ExemptionReason {
  code: string;
  category: ExemptionCategory;
  /** النصُّ العربي كما في المعيار §11.2.4 — يخرج للهيئة في `cbc:TaxExemptionReason` لغير `O`. */
  ar: string;
  /** النصُّ الإنجليزي كما في المعيار. */
  en: string;
  /** المادّةُ من اللائحة التنفيذية التي يحيل إليها الرمز (من رقمه). */
  article: string;
  box: DeclarationBox;
  /** `false` للتابع للمشتري — يُعرف ولا يُعرض ولا يُقبل (الحدُّ المعلَن). */
  selectable: boolean;
}

/** الرمزُ الوحيد لفئة «خارج النطاق» — نصُّه حرٌّ يكتبه التاجر على كل حالة. */
export const OUT_OF_SCOPE_REASON_CODE = 'VATEX-SA-OOS';

export const EXEMPTION_REASONS: readonly ExemptionReason[] = [
  // E — التوريدات المعفاة
  { code: 'VATEX-SA-29', category: 'E', ar: 'الخدمات المالية', en: 'Financial services mentioned in Article 29 of the VAT Regulations', article: 'م٢٩', box: 5, selectable: true },
  { code: 'VATEX-SA-29-7', category: 'E', ar: 'عقد تأمين على الحياة', en: 'Life insurance services mentioned in Article 29 of the VAT Regulations', article: 'م٢٩/٧', box: 5, selectable: true },
  { code: 'VATEX-SA-30', category: 'E', ar: 'التوريدات العقارية المعفاة من الضريبة', en: 'Real estate transactions mentioned in Article 30 of the VAT Regulations', article: 'م٣٠', box: 5, selectable: true },
  // Z — التوريدات الخاضعة لنسبة الصفر
  { code: 'VATEX-SA-32', category: 'Z', ar: 'صادرات السلع من المملكة', en: 'Export of goods', article: 'م٣٢', box: 4, selectable: true },
  { code: 'VATEX-SA-33', category: 'Z', ar: 'صادرات الخدمات من المملكة', en: 'Export of services', article: 'م٣٣', box: 4, selectable: true },
  { code: 'VATEX-SA-34-1', category: 'Z', ar: 'النقل الدولي للسلع', en: 'The international transport of Goods', article: 'م٣٤/١', box: 3, selectable: true },
  { code: 'VATEX-SA-34-2', category: 'Z', ar: 'النقل الدولي للركاب', en: 'International transport of passengers', article: 'م٣٤/٢', box: 3, selectable: true },
  { code: 'VATEX-SA-34-3', category: 'Z', ar: 'الخدمات المرتبطة مباشرة أو عرضياً بتوريد النقل الدولي للركاب', en: 'Services directly connected and incidental to a Supply of international passenger transport', article: 'م٣٤/٣', box: 3, selectable: true },
  { code: 'VATEX-SA-34-4', category: 'Z', ar: 'توريد وسائل النقل المؤهلة', en: 'Supply of a qualifying means of transport', article: 'م٣٤/٤', box: 3, selectable: true },
  { code: 'VATEX-SA-34-5', category: 'Z', ar: 'الخدمات ذات الصلة بنقل السلع أو الركاب (م٢٥ من اللائحة)', en: 'Any services relating to Goods or passenger transportation, as defined in article twenty five of these Regulations', article: 'م٣٤/٥', box: 3, selectable: true },
  { code: 'VATEX-SA-35', category: 'Z', ar: 'الأدوية والمعدات الطبية', en: 'Medicines and medical equipment', article: 'م٣٥', box: 3, selectable: true },
  { code: 'VATEX-SA-36', category: 'Z', ar: 'المعادن المؤهلة', en: 'Qualifying metals', article: 'م٣٦', box: 3, selectable: true },
  { code: 'VATEX-SA-EDU', category: 'Z', ar: 'الخدمات التعليمية الخاصة للمواطنين', en: 'Private education to citizen', article: 'الخانة 2 — تابعةٌ للمشتري', box: 2, selectable: false },
  { code: 'VATEX-SA-HEA', category: 'Z', ar: 'الخدمات الصحية الخاصة للمواطنين', en: 'Private healthcare to citizen', article: 'الخانة 2 — تابعةٌ للمشتري', box: 2, selectable: false },
  { code: 'VATEX-SA-MLTRY', category: 'Z', ar: 'توريد السلع العسكرية المؤهلة', en: 'Supply of qualified military goods', article: 'م٣٤ (المؤهلة عسكرياً)', box: 3, selectable: true },
  // O — غير الخاضعة: السبب يتم تزويده من قبل المكلف على أساس كل حالة على حدة
  { code: OUT_OF_SCOPE_REASON_CODE, category: 'O', ar: 'خارج نطاق الضريبة — بسببٍ يكتبه المكلَّف لكل حالة', en: 'Reason is free text, to be provided by the taxpayer on case to case basis', article: 'خارج النطاق', box: null, selectable: true },
];

const BY_CODE: ReadonlyMap<string, ExemptionReason> = new Map(EXEMPTION_REASONS.map((r) => [r.code, r]));

export function exemptionReasonByCode(code: string | null | undefined): ExemptionReason | undefined {
  return code ? BY_CODE.get(code) : undefined;
}

/** حدّا نصّ «خارج النطاق» بعد قصّ الأطراف — ترجيحٌ معلَن في `ق-١٢٢٢`، يغيّره المالك بلا أثرٍ على القائم. */
export const OUT_OF_SCOPE_REASON_MIN = 3;
export const OUT_OF_SCOPE_REASON_MAX = 250;
