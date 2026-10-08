import { SUPPORTED_REGIONS } from './regions';

/**
 * ⚖️ **جوالُ المنشأة وعميلها، بإقليمها** (توجيه ٢٨٧ · `ق-١٦٢٠` · `ق-١٣٥٠`): الرمزُ يصل «جوالَ المستأجر المسجّل في بطاقته»، والبطاقةُ تحمل
 * الرقمَ نصّاً كما كتبه الموظّف (`0555…` · `+966 55…` · بأرقامٍ عربية). فالرقمُ يُطبَّع هنا إلى الصيغة الدولية قبل أن يُرسل إليه شيء، ويُقنَّع
 * قبل أن يُعرض أو يُكتب في سجلّ.
 *
 * **ومسكنُه سجلُّ الأقاليم** (`ق-١٣٦٨`): رمزُ الاتصال الدوليّ وبادئةُ الرقم المحلّي وشكلُ رقم الجوال قيمُ دولة، فتُكتب هنا وتُقرأ بدولة
 * المنشأة؛ والنواةُ لا تعرفها. ⛔ ولا يُبنى اليوم شيءٌ لدولةٍ أخرى: الإقليمُ الثاني يُضيف خطّتَه هنا حين يُضاف.
 */
export interface MobilePlan {
  /** رمزُ الاتصال الدوليّ بلا `+`. */
  callingCode: string;
  /** بادئةُ الرقم المحلّي (`0`). */
  trunkPrefix: string;
  /** شكلُ رقم الجوال الوطنيّ بعد رمز الدولة وبلا البادئة. */
  nationalMobile: RegExp;
}

/** مزوّدُ التحقّق من الهويّة الوطنيّ للإقليم، واسمُه كما يُعرض للعميل. */
export interface IdentityPlan {
  provider: string;
  displayName: string;
  /** مخطّطاتُ معرّف العميل التي يتحقّق منها المزوّد (`Customer.otherIdScheme`). */
  idSchemes: readonly string[];
}

export const MOBILE_PLANS: Readonly<Record<string, MobilePlan>> = Object.freeze({
  SA: Object.freeze({ callingCode: '966', trunkPrefix: '0', nationalMobile: /^5\d{8}$/ }),
});

export const IDENTITY_PLANS: Readonly<Record<string, IdentityPlan>> = Object.freeze({
  SA: Object.freeze({ provider: 'NAFATH', displayName: 'نفاذ', idSchemes: Object.freeze(['NAT', 'IQA']) }),
});

/** خطّةُ الجوال لدولة المنشأة — ودولةٌ لا خطّةَ لها خطأُ إعدادٍ يُرمى ولا يُفترض. */
export function mobilePlanOf(country: string): MobilePlan {
  const plan = MOBILE_PLANS[country.trim().toUpperCase()];
  if (!plan) throw new Error(`لا خطّةَ جوالٍ للإقليم «${country}» في سجلّ الأقاليم`);
  return plan;
}

export function identityPlanOf(country: string): IdentityPlan | null {
  return IDENTITY_PLANS[country.trim().toUpperCase()] ?? null;
}

const ARABIC_INDIC = /[٠-٩۰-۹]/g;
const toLatinDigits = (s: string) => s.replace(ARABIC_INDIC, (d) => String((d.charCodeAt(0) & 0xf) % 10));

/**
 * رقمُ جوالٍ بالصيغة الدولية (`+9665XXXXXXXX`) أو `null` إن لم يكن جوالاً صالحاً في الإقليم. يقبل البادئةَ المحلّية والدولية (`+` و`00`)
 * والمسافاتِ والشرطاتِ والأقواسَ والأرقامَ العربية — ولا يخمّن: ما لا يطابق شكلَ الجوال يُردّ `null` فيُرفض باسمه عند الاستعمال.
 */
export function normalizeMobile(raw: string | null | undefined, country: string): string | null {
  if (!raw) return null;
  const plan = mobilePlanOf(country);
  let s = toLatinDigits(raw).replace(/[\s\-().‏‎]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  else if (s.startsWith(plan.trunkPrefix)) s = plan.callingCode + s.slice(plan.trunkPrefix.length);
  else if (!s.startsWith(plan.callingCode)) s = plan.callingCode + s;
  if (!/^\d+$/.test(s) || !s.startsWith(plan.callingCode)) return null;
  const national = s.slice(plan.callingCode.length);
  return plan.nationalMobile.test(national) ? `+${s}` : null;
}

/**
 * الجوالُ مقنَّعاً كما يُعرض ويُكتب في السجلّات (`ق-١٦٢٠` · توجيه ٢٨٧ ⑪: «ورقم الجوال لا يظهر كاملاً»): البادئةُ المحلّية وثلاثةُ أرقامٍ بعدها،
 * ثم ثلاثُ نقاط، ثم الأرقامُ الثلاثة الأخيرة — شكلُ النموذج المرئيّ المُقرّ (`ق-١٦٣٤`): «0555 ••• 442».
 */
export function maskMobile(e164: string, country: string): string {
  const plan = mobilePlanOf(country);
  const digits = e164.replace(/^\+/, '');
  const national = digits.startsWith(plan.callingCode) ? digits.slice(plan.callingCode.length) : digits;
  const local = plan.trunkPrefix + national;
  return `${local.slice(0, 4)} ••• ${local.slice(-3)}`;
}

/** الدولُ التي لها خطّةُ جوال — ليُفحص أن كلَّ إقليمٍ تخدمه المنصّة له خطّة. */
export const regionsWithoutMobilePlan = (): string[] => Object.keys(SUPPORTED_REGIONS).filter((c) => !MOBILE_PLANS[c]);
