import { ALLOWED_SCREENS } from '../templates/screens';

/**
 * قطاع النشاط — **الشاشات مشتقّة منه، لا مكتوبةً بجانبه**.
 *
 * ## ⚠️ ولا يُسمّى `activityType` — وهذا ليس ذوقاً
 *
 * في المخطط **حقلان بهذا الاسم ومعناهما مختلف تماماً**:
 *
 * - `Property.activityType` — **استعمال العقار**: `residential` · `shop` ·
 *   `office` · `warehouse` · `mixed`. يقارَن به في `contracts.service.ts:368`.
 * - `BusinessActivity.activityType` — **قطاع المنشأة** بنصّه الحرّ
 *   (`عقارات` · `مطاعم` …).
 *
 * ومحورهما مختلف: الأول يصف عقاراً، والثاني يصف منشأة. فاسمٌ ثالث مشترك
 * بينهما يُقرأ خطأً في أول جلسة قادمة — ولذلك `sector` حقلٌ جديد،
 * و**`activityType` القديم لا يُمسّ** (قرار المالك 2026-08-13).
 *
 * ## والنواة تُعطى للجميع
 *
 * الترشيح يقع على **سبع شاشات** لا على الأربع والعشرين. وما عداها نواةٌ
 * تخدم كل نشاط بلا استثناء (`CLAUDE.md §3`) — فمنشأةٌ بلا فواتير أو
 * عملاء أو دليل حسابات ليست منشأة.
 */

/**
 * القطاعات — **قائمة مغلقة**، ستٌّ اعتمدها المالك و`OTHER`.
 *
 * ⚠️ و`OTHER` ليست قطاعاً تجارياً بل **المهرب الآمن**: ما لا يُعرف يرى
 * الكل. فالنسيان يُنتج شاشاتٍ زائدة لا مفقودة — والزائدة تُشتكى وتُصلَح،
 * والمفقودة تُقرأ «تعطّلت المنصة».
 */
export const SECTORS = ['REALESTATE', 'RESTAURANT', 'RETAIL', 'PHARMACY', 'CONTRACTING', 'FREELANCE', 'OTHER'] as const;
export type Sector = (typeof SECTORS)[number];

export const SECTOR_LABELS: Record<Sector, string> = {
  REALESTATE: 'مكتب عقاري',
  RESTAURANT: 'مطعم أو كافيه',
  RETAIL: 'تجزئة',
  PHARMACY: 'صيدلية',
  CONTRACTING: 'مقاولات',
  FREELANCE: 'عمل حرّ',
  OTHER: 'أخرى',
};

/**
 * الشاشات السبع التي يقع عليها الترشيح — **الباقي نواة**.
 *
 * ⚠️ تُعرَّف بالطرح لا بالعدّ: `CORE = ALLOWED_SCREENS − GATED`. فشاشةٌ
 * جديدة تُضاف إلى `screens.ts` تصير **نواةً تلقائياً** — تظهر للجميع حتى
 * يُقرَّر تصنيفها. والاتجاه الآخر (عدّ النواة يدوياً) يجعل الشاشة الجديدة
 * **تختفي عن الجميع** بصمت، وهو أسوأ عطلٍ ممكن هنا.
 */
const GATED_SCREENS = ['properties', 'contracts', 'maintenance', 'pos', 'products', 'inventory', 'quotes'] as const;

/** ما يضيفه كل قطاع فوق النواة. */
const SECTOR_EXTRAS: Record<Sector, readonly string[]> = {
  REALESTATE: ['properties', 'contracts', 'maintenance'],
  RESTAURANT: ['pos', 'products', 'inventory'],
  RETAIL: ['pos', 'products', 'inventory', 'quotes'],
  /**
   * ⚠️ **= المطعم حرفياً، وهو حدٌّ معلَن لا تطابقٌ حقيقي.**
   *
   * فرقُ الصيدلية (تواريخ الصلاحية · أرقام التشغيلة · الوصفات) يقع **داخل
   * المخزون** لا في شاشةٍ مستقلة — فالترشيح بالشاشات لا يفرّقهما. مقبولٌ
   * مؤقتاً بقرار المالك 2026-08-13، وبندٌ مسجَّل.
   */
  PHARMACY: ['pos', 'products', 'inventory'],
  /**
   * ⚠️ **ما تحتاجه المقاولات فعلاً غير مبنيّ**: مشاريع · أوامر عمل ·
   * مراحل · مستخلصات. وليست في `ALLOWED_SCREENS` أصلاً.
   *
   * فما يُعطى هنا **أقلّ مما يحتاجه المقاول** — والمخزون صحيح (المواد
   * مخزون فعلاً) لكنه لا يغني عن الغائب. مسجَّلٌ صراحةً كي لا يُظنّ
   * القطاع مخدوماً (قرار المالك 2026-08-13).
   */
  CONTRACTING: ['quotes', 'products', 'inventory'],
  /**
   * `products` بلا `inventory`: كثيرٌ من المستقلّين يبيعون **منتجات رقمية
   * وقوالب** — فالصنف يُعرَّف ويُفوتر، ولا مخزون مادي يُتابَع.
   */
  FREELANCE: ['quotes', 'products'],
  /** المهرب الآمن — يرى الكل. */
  OTHER: GATED_SCREENS,
};

/** النواة: كل ما ليس محلَّ ترشيح. **بالطرح لا بالعدّ.** */
export const CORE_SCREENS: readonly string[] = ALLOWED_SCREENS.filter((s) => !(GATED_SCREENS as readonly string[]).includes(s));

/**
 * ⚠️ **مُصدَّرة عمداً — كي يفحصها الحارس قبل أي ترشيح.**
 *
 * `screensFor` يُرشِّح ما ليس في `ALLOWED_SCREENS`، والترشيح **يخفي
 * الخطأ**: اسمٌ مخترَع يُحذف صامتاً فتُنتَج خريطةٌ ناقصة تبدو سليمة. وهي
 * الحادثة التي وقعت حرفياً في شجرة الصلاحيات (`RAW_DOMAINS`).
 */
export const RAW_SECTOR_EXTRAS = SECTOR_EXTRAS;
export const RAW_GATED_SCREENS = GATED_SCREENS;

/**
 * الشاشات التي يراها فاعلٌ بأنشطته.
 *
 * @param sectors قطاعات الأنشطة **المفعَّلة** — المعطَّلة لا تُمرَّر.
 *
 * ⚠️ **لا أنشطة ⇒ الكل.** وهذا ليس تساهلاً بل الاتجاه الآمن الذي أقرّه
 * المالك: منشأةٌ قائمة لم تختر نشاطها الرئيسي بعد **ترى ما كانت تراه
 * بالضبط**. فلا يستيقظ تاجرٌ فلا يجد شاشاته.
 */
export function screensFor(sectors: readonly Sector[]): Set<string> {
  if (sectors.length === 0) return new Set(ALLOWED_SCREENS);
  const out = new Set<string>(CORE_SCREENS);
  for (const s of sectors) {
    for (const screen of SECTOR_EXTRAS[s] ?? []) {
      // ⚠️ الترشيح هنا احتياطٌ لا مصدر: الحارس يفحص الخريطة الخام قبله.
      if ((ALLOWED_SCREENS as readonly string[]).includes(screen)) out.add(screen);
    }
  }
  return out;
}

/**
 * مطابقة النصّ الحرّ على قطاع — **اقتراحٌ لا حكم**.
 *
 * ⚠️ ناتجها يُكتب في `sectorSuggested` **ولا يُكتب في `sector` أبداً**
 * (قرار المالك). فنصوصٌ مثل «عقارات وتجارة» أو «مؤسسة الرياض» لا تُطابَق
 * بثقة، وخطأٌ واحد **يُخفي شاشةً يعمل عليها تاجر**. والمالك يؤكّد.
 *
 * @returns القطاع المرشَّح، أو `null` إن لم يُطابق بثقة.
 */
export function suggestSector(freeText: string | null | undefined): Sector | null {
  const t = (freeText ?? '').trim().toLowerCase();
  if (!t) return null;
  for (const [sector, words] of Object.entries(ALIASES) as [Sector, readonly string[]][]) {
    if (words.some((w) => t.includes(w))) return sector;
  }
  return null;
}

/**
 * مرادفاتٌ للمطابقة — **ولا `OTHER` فيها**: «أخرى» ليست شيئاً يُطابَق، بل
 * ما يبقى حين لا يُطابق شيء. ووجودها هنا يجعل كل نصٍّ غامض يُرشَّح
 * «أخرى» بثقةٍ كاذبة بدل أن يُترك للمالك.
 */
const ALIASES: Partial<Record<Sector, readonly string[]>> = {
  REALESTATE: ['عقار', 'عقارات', 'إيجار', 'ايجار', 'تأجير', 'real estate', 'property'],
  RESTAURANT: ['مطعم', 'مطاعم', 'كافيه', 'مقهى', 'قهوة', 'restaurant', 'cafe'],
  PHARMACY: ['صيدلي', 'صيدلية', 'صيدليات', 'دواء', 'أدوية', 'pharmacy'],
  CONTRACTING: ['مقاول', 'مقاولات', 'إنشاء', 'انشاء', 'بناء', 'contracting'],
  FREELANCE: ['عمل حر', 'عمل حرّ', 'مستقل', 'حرّ', 'freelance'],
  // ⚠️ التجزئة آخر المطابَقات عمداً: كلماتها عامّة («متجر» · «بيع») وتبتلع
  // ما قبلها لو سبقتها — «متجر أدوية» صيدلية لا تجزئة.
  RETAIL: ['تجزئة', 'متجر', 'بقالة', 'سوبرماركت', 'بيع', 'retail', 'store', 'shop'],
};
