import { ALLOWED_SCREENS, ScreenAction, actionsFor } from '../templates/screens';

/**
 * شجرة نطاقات الصلاحيات — **مشتقّة من `screens.ts` لا مكتوبة يدوياً**.
 *
 * ## لماذا الاشتقاق شرطٌ بنيوي
 *
 * شجرةٌ مكتوبة يدوياً تتعفّن عند أول وحدة جديدة: تُضاف شاشة إلى
 * `ALLOWED_SCREENS` فتعمل حراستها (`@RequiresScreen`) بينما تبقى غائبة عن
 * شجرة التفويض — فلا يستطيع أحد تفويضها، **ولا يشتكي شيء**. وهي عائلة
 * العطل التي تكرّرت في هذا المشروع: تعريفٌ يُقرأ صحيحاً وقد تخلّف عن الواقع
 * (دليل الحسابات · النشاط الافتراضي · تعليق `BusinessActivity`).
 *
 * فالشجرة هنا **عرضٌ للسجلّ القائم**، لا سجلٌّ ثانٍ. تُضاف شاشة ⇒ تظهر في
 * الشجرة تلقائياً. ومَن ينسى إسنادها إلى نطاق يجدها تحت «أخرى» ظاهرةً — لا
 * مفقودة صامتةً.
 *
 * ## ولا نظام صلاحيات ثانٍ
 *
 * الوحدة **لا تعرّف صلاحية جديدة**: مفرداتها هي `ALLOWED_SCREENS` و
 * `SCREEN_ACTIONS` أنفسهما — نفس ما تفحصه `@RequiresScreen`/`@RequiresAction`.
 * التفويض يقيّد هذه المفردات ولا يوسّعها.
 */

/** عقدة في الشجرة: نطاقٌ يضمّ شاشات، أو شاشة بعينها. */
export interface TreeNode {
  /** معرّف العقدة: اسم النطاق (`realestate`) أو اسم الشاشة (`contracts`). */
  key: string;
  label: string;
  /** الشاشات التي تقع تحت هذه العقدة — العقدة الورقية تحمل شاشتها وحدها. */
  screens: readonly string[];
  children: readonly TreeNode[];
}

/**
 * إسناد الشاشات إلى نطاقاتها.
 *
 * ⚠️ هذه الخريطة **تصنيفٌ للعرض فقط** — لا مصدر للشاشات. الشاشة غير
 * المُسنَدة **لا تختفي**: تظهر تحت «أخرى» (انظر `buildTree`). فنسيانُ
 * التصنيف عيبٌ مرئي لا ثغرة صامتة.
 */
export interface RawDomain {
  key: string;
  label: string;
  screens: readonly string[];
}

/**
 * ⚠️ **مُصدَّرة عمداً — كي يفحصها الحارس قبل الترشيح.**
 *
 * `buildTree` يُرشِّح ما ليس في `ALLOWED_SCREENS`. والترشيح **يخفي الخطأ**:
 * اسمٌ مخترَع يُحذف صامتاً فتُنتَج شجرةٌ ناقصة تبدو سليمة. وحارسٌ يقرأ
 * `buildTree()` يقرأ **المخرَج المنقّى** فلا يرى شيئاً — وهو ما وقع فعلاً:
 * أُعيد الاسم المخترَع `invoices` إلى الخريطة فمرّ الحارس بسبعة نجاحات.
 *
 * فالفحص يقع على **هذه** لا على مخرَجها.
 */
export const RAW_DOMAINS: readonly RawDomain[] = [
  { key: 'realestate', label: 'إدارة العقارات', screens: ['properties', 'contracts', 'maintenance'] },
  { key: 'accounting', label: 'المحاسبة', screens: ['accounts', 'journal', 'fiscal', 'reports'] },
  { key: 'sales', label: 'المبيعات', screens: ['pos', 'quotes', 'invoice', 'payments', 'customers'] },
  { key: 'purchasing', label: 'المشتريات والمخزون', screens: ['suppliers', 'products', 'inventory'] },
  { key: 'hr', label: 'الموارد البشرية', screens: ['employees'] },
  { key: 'banking', label: 'البنوك', screens: ['banks', 'transactions'] },
  { key: 'compliance', label: 'الامتثال', screens: ['obligations', 'scripts', 'audit'] },
  { key: 'company', label: 'المنشأة', screens: ['settings', 'branches', 'forms'] },
  { key: 'overview', label: 'نظرة عامة', screens: ['dashboard'] },
] as const;

/** يبني الشجرة من `ALLOWED_SCREENS` — وما لا يُسنَد يظهر تحت «أخرى». */
export function buildTree(): TreeNode[] {
  const known = new Set<string>();
  const domains: TreeNode[] = RAW_DOMAINS.map((d) => {
    const screens = d.screens.filter((s) => (ALLOWED_SCREENS as readonly string[]).includes(s));
    screens.forEach((s) => known.add(s));
    return {
      key: d.key,
      label: d.label,
      screens,
      children: screens.map((s) => ({ key: s, label: s, screens: [s], children: [] })),
    };
  }).filter((d) => d.screens.length > 0);

  const orphans = (ALLOWED_SCREENS as readonly string[]).filter((s) => !known.has(s));
  if (orphans.length) {
    domains.push({
      key: 'other',
      label: 'أخرى (غير مُسنَدة)',
      screens: orphans,
      children: orphans.map((s) => ({ key: s, label: s, screens: [s], children: [] })),
    });
  }
  return domains;
}

/** كل الشاشات التي تقع تحت عقدة — الجذر يعني الكل. */
export function screensUnder(nodeKey: string): readonly string[] {
  if (nodeKey === 'root') return ALLOWED_SCREENS as readonly string[];
  for (const d of buildTree()) {
    if (d.key === nodeKey) return d.screens;
    const leaf = d.children.find((c) => c.key === nodeKey);
    if (leaf) return leaf.screens;
  }
  return [];
}

/** زوج (شاشة، فعل) بصيغته النصية — مفتاح التقاطع. */
export type Grant = `${string}:${ScreenAction}`;
export const grant = (screen: string, action: ScreenAction): Grant => `${screen}:${action}`;

/** The largest possible set: every screen with the actions that exist on it. */
export function allGrants(): Set<Grant> {
  const out = new Set<Grant>();
  for (const s of ALLOWED_SCREENS) for (const a of actionsFor(s)) out.add(grant(s, a));
  return out;
}

/** Expands a delegation on a node into its pairs; an action is kept only on the screens where it exists. */
export function expand(nodeKey: string, actions: readonly ScreenAction[]): Set<Grant> {
  const out = new Set<Grant>();
  for (const s of screensUnder(nodeKey)) for (const a of actions) if (actionsFor(s).includes(a)) out.add(grant(s, a));
  return out;
}
