/**
 * فئات المشتريات — **مصدرٌ واحد**: الرمز، ولافتته العربية، وحساب مصروفها.
 *
 * كانت ثلاثة قرارات تُتَّخذ بمطابقة **نصٍّ عربيّ حرفاً بحرف** في ثلاثة ملفات:
 * جواز الإطفاء · تقرير التأسيس · حساب الترحيل. وكانت المطابقة **غير متناظرة**:
 * موضعان يشذّبان المسافات وثالثٌ لا يشذّب — ففاتورةٌ فئتها `'مصروفات تأسيس '`
 * كانت **تمرّ من فحص الإطفاء وتغيب من التقرير**. والواجهة تعرض ثماني فئات،
 * أربعٌ منها **بلا مدخلٍ في خريطة الحسابات إطلاقاً**، فترحَّل ضمناً إلى المستقرّ.
 *
 * فصار القرار **بالرمز** (`RENT`) لا باللافتة (`إيجار`): رمزٌ لا يحمل مسافةً ولا
 * تشكيلاً ولا لغةً، ولافتتُه للعرض وحده. والحارس `purchase-categories.spec.ts`
 * يثبت أن ما تعرضه الواجهة هو ما تعرفه الخريطة، **في الاتجاهين**.
 *
 * ⚠️ والحسابات هنا ليست تفصيلاً: الكهرباء والمياه والاتصالات والإيجار تقع على
 * `5300` «مصروفات إدارية وعمومية» لأن الدليل الافتراضي **لا يحمل حساباً مستقلاً
 * لأيٍّ منها**. فهذا تصنيفٌ خشِن **مُعلَن**، لا خطأ صامت — وفتحُ حساباتٍ مستقلة
 * قرارُ مالكٍ يمسّ الدليل لا تعديلَ شيفرة.
 */
export type PurchaseCategory = {
  /** الرمز المخزَّن والمقروء — لا يُترجَم ولا يُشذَّب. */
  code: string;
  /** اللافتة العربية المعروضة، وهي أيضاً ما كان يُخزَّن قبل الرموز. */
  label: string;
  /** حساب المصروف في الدليل. */
  account: string;
};

export const PURCHASE_CATEGORIES: readonly PurchaseCategory[] = [
  { code: 'POWER', label: 'كهرباء', account: '5300' },
  { code: 'WATER', label: 'مياه', account: '5300' },
  { code: 'TELECOM', label: 'اتصالات وإنترنت', account: '5300' },
  { code: 'RENT', label: 'إيجار', account: '5300' },
  { code: 'SALARIES', label: 'رواتب', account: '5200' },
  { code: 'COGS', label: 'تكلفة مبيعات', account: '5100' },
  { code: 'FORMATION', label: 'مصروفات تأسيس', account: '5500' },
  { code: 'OTHER', label: 'مصروفات أخرى', account: '5400' },
] as const;

/** الفئة الوحيدة التي يجوز إطفاء مصروفها (`SPEC` والنموذج الأصلي معاً). */
export const AMORTIZABLE_CATEGORY = 'FORMATION';

/** المستقرّ حين لا رمز: «مصروفات إدارية وعمومية»، كما في النموذج الأصلي. */
export const DEFAULT_EXPENSE_ACCOUNT = '5300';

/**
 * لافتاتٌ كانت تُخزَّن قبل الرموز ولا تعرضها الواجهة اليوم. تبقى مقروءةً لأن
 * صفوفاً قديمة تحملها — **وحذفها يعني ترحيل تلك الصفوف إلى المستقرّ بصمت**.
 */
const LEGACY_LABEL_CODE: Record<string, string> = {
  'رواتب وأجور': 'SALARIES',
  'مواد خام': 'COGS',
  بضاعة: 'COGS',
};

const BY_CODE = new Map(PURCHASE_CATEGORIES.map((c) => [c.code, c]));
const BY_LABEL = new Map(PURCHASE_CATEGORIES.map((c) => [c.label, c.code]));

export const PURCHASE_CATEGORY_CODES: readonly string[] = PURCHASE_CATEGORIES.map((c) => c.code);

/**
 * يستخرج الرمز من رمزٍ أو من لافتةٍ قديمة. **يشذّب دائماً** — فالمسافة اللاحقة
 * هي العلّة التي وُلد هذا الملف لإغلاقها، وإغلاقُها في موضعٍ واحد أوثق من
 * تكرار `trim` عند كل قارئ.
 */
export function toPurchaseCategoryCode(value?: string | null): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  if (BY_CODE.has(v)) return v;
  return BY_LABEL.get(v) ?? LEGACY_LABEL_CODE[v] ?? null;
}

/** حساب المصروف للرمز — والمستقرّ لما لا رمز له (فئةٌ حرّة كتبها التاجر). */
export function purchaseExpenseAccountCode(categoryCode?: string | null): string {
  const code = toPurchaseCategoryCode(categoryCode);
  return (code && BY_CODE.get(code)?.account) || DEFAULT_EXPENSE_ACCOUNT;
}

/** اللافتة المعروضة للرمز، وإلا فالنصّ كما هو (فئةٌ حرّة). */
export function purchaseCategoryLabel(value?: string | null): string | null {
  const code = toPurchaseCategoryCode(value);
  return code ? (BY_CODE.get(code)?.label ?? null) : ((value ?? '').trim() || null);
}
