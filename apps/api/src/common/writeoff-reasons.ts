/**
 * أسباب شطب المخزون — **ورمزُ السبب يحمل مساره الضريبي في تعريفه**.
 *
 * ## لماذا الرمز لا النصّ، ولماذا المسار في التعريف لا في الترحيل
 *
 * أسباب الشطب تنقسم **مسارين ضريبيين متعاكسين**، وخلطهما في رمزٍ واحد **يُنتج
 * إقراراً خاطئاً بلا عَرَضٍ ظاهر** — لا رسالة ولا صفر، بل رقمٌ في إقرارٍ يُقدَّم:
 *
 * | المسار | الحكم | النصّ |
 * |---|---|---|
 * | `NO_ADJUSTMENT` | **لا تعديل لضريبة المدخلات، ولا توريد اعتباري** | اللائحة `م١٥(٤)` · `م٤٩(٥)` · `م٥٢(٧)` |
 * | `DEEMED_SUPPLY` | **توريدٌ اعتباري بضريبة مخرجات** | اللائحة `م١٥` |
 *
 * **والمسار مكتوبٌ في تعريف الرمز نفسه** (قرار المالك 2026-09-04): فمن يضيف رمزاً
 * بعد سنة **يُجبره المترجم على إعلان مساره**، ولا يرثه من رمزٍ جاوره في قائمة.
 * ولو كان المسار في شيفرة الترحيل (`if code === …`) لكان الرمز الجديد **يقع في
 * الفرع الافتراضي بصمت** — وهو بالضبط ما وقع في خريطة فئات المشتريات: أربع فئاتٍ
 * معروضة بلا مدخل، فرُحِّلت كلها إلى المستقرّ ولا أحد يعلم.
 *
 * ## ⚠️ والافتراضيّ في التلف: **لا تعديل**
 *
 * الشائع في أنظمة ERP عكسُ ضريبة المدخلات تلقائياً عند الإعدام — **وهو مخالفٌ
 * للنصّ السعودي** (`ق-٩٥`). فمن يرى قيد التلف بلا سطر ضريبة فيظنّه ناقصاً: هذا
 * موضعه.
 */

/** المسار الضريبي — قيمتان لا ثالث لهما، وكلٌّ بنصّها. */
export type TaxPath = 'NO_ADJUSTMENT' | 'DEEMED_SUPPLY';

export interface WriteOffReason {
  /** الرمز المخزَّن والمقروء — لا يُترجَم ولا يُشذَّب. */
  code: string;
  /** اللافتة العربية المعروضة. */
  label: string;
  /** **المسار الضريبي — إعلانٌ إلزاميّ لا وراثة.** */
  taxPath: TaxPath;
  /** سندُ التصنيف، ليُراجَع لا ليُصدَّق. */
  source: string;
  /** هل يشترط اعتماد صاحب صلاحية `review`؟ (الكاشير لا يقرّر التلف — `ق-٩٤`.) */
  requiresReview: boolean;
}

export const WRITEOFF_REASONS: readonly WriteOffReason[] = [
  {
    code: 'DAMAGE',
    label: 'تلف',
    taxPath: 'NO_ADJUSTMENT',
    source: 'اللائحة م١٥(٤) — لا توريد اعتباري عند الإتلاف؛ ودليل خصم المدخلات ط٣ §10.3 ص٤٢',
    requiresReview: true,
  },
  {
    code: 'LOSS',
    label: 'فقد',
    taxPath: 'NO_ADJUSTMENT',
    source: 'اللائحة م١٥(٤) و م٤٩(٥) — القيد في السجلات كافٍ، وللهيئة طلب أدلة',
    requiresReview: true,
  },
  {
    code: 'THEFT',
    label: 'سرقة',
    taxPath: 'NO_ADJUSTMENT',
    source: 'اللائحة م١٥(٤) و م٤٩(٥) — وتقرير الشرطة من الأدلة المسمّاة',
    requiresReview: true,
  },
  {
    code: 'BUSINESS_DESTRUCTION',
    label: 'إتلافٌ ضمن النشاط',
    taxPath: 'NO_ADJUSTMENT',
    source: 'دليل خصم المدخلات ط٣ — الأسئلة الشائعة س٣ ص٧٠: لا اشتراط بتعديل الخصم على ما يجب إتلافه كجزء من النشاط',
    requiresReview: true,
  },
  {
    code: 'PERSONAL_USE',
    label: 'استخدامٌ شخصي',
    taxPath: 'DEEMED_SUPPLY',
    source: 'اللائحة م١٥ — استعمال السلع لغير غرض النشاط توريدٌ اعتباري',
    requiresReview: true,
  },
  {
    code: 'NON_BUSINESS_USE',
    label: 'خروجٌ عن النشاط',
    taxPath: 'DEEMED_SUPPLY',
    source: 'اللائحة م١٥ — التصرّف في السلع لغير أغراض النشاط الاقتصادي',
    requiresReview: true,
  },
  {
    code: 'GIFT_ABOVE_LIMIT',
    label: 'هديةٌ فوق الحدّ',
    taxPath: 'DEEMED_SUPPLY',
    source: 'اللائحة م١٥ — الهدايا والعيّنات فوق الحدّ المقرَّر للمستفيد سنوياً وللإجمالي',
    requiresReview: true,
  },
  {
    code: 'DEREGISTRATION_RETENTION',
    label: 'احتفاظٌ بالسلع عند التوقف',
    taxPath: 'DEEMED_SUPPLY',
    source: 'اللائحة م١٥ — الاحتفاظ بالسلع عند التوقف عن ممارسة النشاط',
    requiresReview: true,
  },
] as const;

const BY_CODE = new Map(WRITEOFF_REASONS.map((r) => [r.code, r]));

export const WRITEOFF_REASON_CODES: readonly string[] = WRITEOFF_REASONS.map((r) => r.code);

/** الرمز إن كان معروفاً، وإلا `null` — **ولا مستقرّ هنا**: سببٌ مجهول لا يُشطب به. */
export function writeOffReason(code?: string | null): WriteOffReason | null {
  return BY_CODE.get((code ?? '').trim()) ?? null;
}

/**
 * المسار الضريبي للرمز.
 *
 * ⚠️ **يرمي على المجهول ولا يستقرّ على افتراضي**: مستقرٌّ هنا يعني أن رمزاً جديداً
 * يُصنَّف ضريبياً **بالصمت**، وهو الفرق بين إقرارٍ صحيح وإقرارٍ خاطئ لا عَرَض له.
 */
export function taxPathOf(code: string): TaxPath {
  const reason = BY_CODE.get(code.trim());
  if (!reason) throw new RangeError(`رمز شطبٍ غير معروف: ${code} — والمسار الضريبي لا يُفترَض`);
  return reason.taxPath;
}
