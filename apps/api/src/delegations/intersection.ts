import { Grant } from './permission-tree';

/**
 * التقاطع الحيّ — **بنيةٌ لا وظيفة تُستدعى**.
 *
 * ## القاعدة الصارمة
 *
 * > لا يمنح المفوَّض ما لا يملكه هو.
 *
 * وتحقيقها **بالتقاطع لا بالنسخ**: صلاحية الورقة = تقاطع ما مُنح لها مع كل
 * مستوى فوقها، **يُحسب لحظة كل فحص** لا لحظة التفويض.
 *
 * ## ولماذا هذا يجعل السحب المتتالي مجانياً
 *
 * لو نُسخت الصلاحيات عند التفويض، لاحتاج سحبُها من مشرفٍ عمليةَ «إبطالٍ»
 * تمشي على من وزّع عليهم — وظيفةٌ **تُنسى أو تفشل جزئياً**. وبالتقاطع لا
 * توجد نسخة تُبطَل: تُسحب من المشرف فينطفئ ما وزّعه **بحكم الحساب نفسه**،
 * في الطلب التالي مباشرةً. فالسحب المتتالي **نتيجة بنيوية لا ميزة**.
 *
 * ## ولماذا لا ذاكرة مؤقتة
 *
 * قِيس (CLAUDE.md §القياس): الفحص الواحد **0.22–0.48 µs** أياً كان العمق،
 * والتقاطع الكامل عند عمق 10 **18.6 µs** — أي ~237× أرخص من معاملة سياق
 * المستأجر (4.4 ms) التي **يدفعها كل طلب أصلاً**.
 *
 * وأهمّ من الأداء: الملحق (1) من قرار ZATCA يجعل
 * `Absence of user session management` **محظوراً**. وذاكرةٌ مؤقتة — ولو
 * ثوانيَ — تعني **نافذةً يسري فيها تفويضٌ مسحوب**. فهي **مخاطرة نظامية لا
 * تحسين أداء**.
 *
 * ## ولا نظام صلاحيات ثانٍ
 *
 * المخرَج هنا مجموعة `Grant` = `شاشة:فعل` — نفس ما تفحصه
 * `@RequiresScreen`/`@RequiresAction`. هذه الوحدة **تضيّق** ما يملكه الفاعل
 * ولا تمنحه شيئاً جديداً.
 */

/** حلقة في سلسلة التفويض، من الجذر إلى الورقة. */
export interface DelegationLink {
  /** من فوّض. */
  grantorId: string;
  /** من فُوّض إليه. */
  granteeId: string;
  /** ما مُنح صراحةً في هذه الحلقة. */
  granted: ReadonlySet<Grant>;
  /** مسحوبة؟ الصفّ يبقى في السجل ويُختم — لا يُحذف. */
  revoked: boolean;
}

/**
 * صلاحيات الفاعل الجذر (المالك أو قالب الموظف) — سقف السلسلة كلها.
 * تُقرأ من نظام الصلاحيات القائم، لا من جدول جديد.
 */
export type RootGrants = ReadonlySet<Grant>;

/**
 * يحسب الصلاحيات الفعّالة لسلسلة تفويض.
 *
 * @param root سقف السلسلة — ما يملكه الجذر.
 * @param chain الحلقات مرتّبةً **من الجذر إلى الورقة**.
 *
 * الحلقة المسحوبة **تقطع السلسلة عندها**: من بعدها لا يرث شيئاً. وهذا هو
 * السحب المتتالي — لا حلقة تُحذف، ولا عملية إبطال تمشي على الأبناء.
 */
export function effectiveGrants(root: RootGrants, chain: readonly DelegationLink[]): Set<Grant> {
  let current: ReadonlySet<Grant> = root;

  for (const link of chain) {
    // ⚠️ المسحوبة تُنهي السلسلة ولا تُتخطّى. تخطّيها يعني أن سحب صلاحية من
    // مشرفٍ يترك مرؤوسيه يرثون من فوقه مباشرةً — أي أن السحب لا يسحب.
    if (link.revoked) return new Set();

    const next = new Set<Grant>();
    for (const g of link.granted) if (current.has(g)) next.add(g);
    current = next;

    // لا شيء بقي: ما بعد هذه الحلقة لا يمكن أن يزيد — التقاطع لا يُنمّي.
    if (current.size === 0) return new Set();
  }

  return new Set(current);
}

/**
 * What an actor holds: the template ceiling when nobody delegated to them, otherwise the
 * union over every chain of that ceiling narrowed along the chain. The tenant guard,
 * /me/permissions and delegation writes all call this one rule so they cannot disagree.
 */
export function actorGrants(root: RootGrants, chains: readonly (readonly DelegationLink[])[]): Set<Grant> {
  if (chains.length === 0) return new Set(root);
  const out = new Set<Grant>();
  for (const chain of chains) for (const g of effectiveGrants(root, chain)) out.add(g);
  return out;
}

/**
 * الفحص على طلب واحد — المسار الساخن.
 *
 * لا يبني مجموعةً: يمرّ على الحلقات ويخرج عند أول رفض. قِيس بـ0.22–0.48 µs.
 */
export function hasGrant(root: RootGrants, chain: readonly DelegationLink[], needed: Grant): boolean {
  if (!root.has(needed)) return false;
  for (const link of chain) {
    if (link.revoked) return false;
    if (!link.granted.has(needed)) return false;
  }
  return true;
}
