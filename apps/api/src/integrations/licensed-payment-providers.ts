/**
 * ⚖️ **لا يُربط مزوّدُ دفعٍ إلا بمدرَجٍ في سجلّ الجهة المنظِّمة** (`ق-١٤٩٨` — حكمُ المالك 2026-09-27، بنصّه):
 * «**وقائمةُ ساما: المرجعُ في اختيار مزوّد الدفع، ولا يُربط إلا بمدرَجٍ فيها.**»
 *
 * **بوّابةٌ لا تذكير** (`CLAUDE.md` القاعدة الحاكمة على القواعد): كلُّ مزوّدٍ حقيقيٍّ لبوّابة الدفع في `KNOWN_PROVIDERS` له هنا
 * مدخلٌ يسمّيه **كما في السجلّ** بفئته ورابطه وتاريخ قراءته — وإلا أسقط الحارسُ الحزمة (`licensed-payment-providers.spec.ts`)
 * **ورفض الإنشاءُ الربطَ** (`IntegrationsService.create`) — طبقتان: الشيفرةُ لا تسجّله، والطلبُ لا يمرّ لو سُجّل.
 *
 * 🌍 **أيمسّ افتراضاً سعودياً؟ نعم، ويسكن هنا وحدَه** (`ق-١٣٥٠`): السجلُّ اليوم قائمةُ ساما للشركات المرخّصة لخدمات المدفوعات
 * (`33` شركةً — قُرئت بمصدرين: متصفّحُ اللوحة في ٢٦١ وFirecrawl في ٢٦٧). **والبنيةُ محايدة** — حقلُ `regulator` — فدولةٌ أخرى
 * تُضيف مدخلاً بسجلّ جهتها، ولا يعرف الإنشاءُ ولا الحارسُ اسمَ ساما.
 *
 * **فارغٌ اليوم**: لا مزوّدَ حقيقيّ بعد — و`MOCK` تجريبيٌّ ممنوعٌ في الإنتاج (`TEST_ONLY_PROVIDERS`) فلا يحتاج مدخلاً.
 * المراجع: `docs/licensing-and-operations.md` (صفُّ المزوّد المدرَج) · `docs/domain-scan/27-أجهزة-نقاط-البيع.md` (`W72`).
 */
export interface RegulatorListing {
  /** الجهةُ المنظِّمة صاحبةُ السجلّ (مثلاً `SAMA`). */
  regulator: string;
  /** الاسمُ كما في السجلّ حرفاً — لا الاسمُ التجاريّ ولا ترجمتُه. */
  listedName: string;
  /** الفئةُ كما في السجلّ (مثلاً «Payment Institution» أو «Electronic Money Institution»). */
  category: string;
  /** رابطُ السجلّ الرسميّ الذي قُرئ منه. */
  registerUrl: string;
  /** تاريخُ القراءة `YYYY-MM-DD` — فالسجلُّ يتغيّر، ومدخلٌ بلا تاريخٍ لا يُعرف متى صحّ. */
  readOn: string;
}

/** رمزُ المزوّد في الشيفرة ⟸ مدخلُه في سجلّ جهته. */
export const LICENSED_PAYMENT_PROVIDERS: Readonly<Record<string, RegulatorListing>> = {};

/** مدخلٌ مكتمل: جهةٌ واسمٌ وفئةٌ ورابطٌ آمنٌ وتاريخٌ بصيغته — لا مدخلٌ فارغٌ يُرضي الحارسَ شكلاً. */
export function isCompleteListing(listing: RegulatorListing | undefined): boolean {
  return (
    listing !== undefined &&
    [listing.regulator, listing.listedName, listing.category].every((s) => typeof s === 'string' && s.trim().length > 0) &&
    /^https:\/\/\S+$/.test(listing.registerUrl) &&
    /^\d{4}-\d{2}-\d{2}$/.test(listing.readOn)
  );
}

/** المزوّدون الحقيقيّون بلا مدخلٍ مكتمل — ما يُسقط الحارسَ ويرفضه الإنشاء. والتجريبيُّ خارجها (ممنوعٌ في الإنتاج بحاجزه). */
export function unlistedProviders(
  known: readonly string[],
  testOnly: ReadonlySet<string>,
  listed: Readonly<Record<string, RegulatorListing>>,
): string[] {
  return known.filter((provider) => !testOnly.has(provider) && !isCompleteListing(listed[provider]));
}
