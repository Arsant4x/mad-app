import { Grant } from './permission-tree';
import { DelegationLink, RootGrants, effectiveGrants } from './intersection';

/**
 * الحالة الثالثة — **مُنحت ثم انطفأت**.
 *
 * ## لماذا لا تكفي حالتان
 *
 * التقاطع يُطفئ منحةً **دون أن يمسّ صفّها**: الصفّ باقٍ في `delegation_logs`
 * بحالته `ACTIVE`، والمنحة مع ذلك لا تنفذ لأن حلقةً فوقها لا تملكها. فلو
 * أعاد الخادم مجموعتين فقط — «فعّالة» و«غير ممنوحة» — لسقطت هذه في الثانية.
 *
 * وأثرها العملي عطلٌ صامت: يرى المفوِّض صلاحيةً «غير ممنوحة» فيمنحها، فلا
 * يتغيّر شيء — **لأن العطب فوقه لا عنده**. ثم يمنحها ثالثةً. ولا رسالة خطأ
 * في أي من المرّات: كل منحةٍ نجحت فعلاً، والتقاطع أطفأها بعدها.
 *
 * فالخادم يجيب عن سؤالٍ لا تستطيع الواجهة اشتقاقه: **مَن أطفأها ولماذا**.
 *
 * ## ولماذا السبب يُحسب هنا لا في الواجهة
 *
 * اشتقاقه يحتاج السلسلة كاملةً بحلقاتها وحالاتها. وحسابُه في الواجهة يعني
 * إعطاءها السلسلة الخام لتستنتج منها — أي **نظام صلاحيات ثانٍ** بحكم الأمر
 * الواقع، ولو لم يُسمَّ كذلك. فالسلسلة تُرسَل للعرض، والحكم يأتي محسوباً.
 */

/**
 * سبب الانطفاء — ثلاثة لا رابع لها، وكلٌّ يقود إلى إصلاحٍ مختلف.
 *
 * - `NOT_IN_ROOT` — القالب نفسه لم يعد يملكها. الإصلاح: تعديل القالب.
 * - `REVOKED` — حلقةٌ فوقها مسحوبة. الإصلاح: إعادة التفويض من فوق.
 * - `NARROWED` — حلقةٌ فوقها قائمة لكنها لا تحمل هذا الزوج. الإصلاح: توسيع
 *   تلك الحلقة.
 */
export type ExtinctionReason = 'NOT_IN_ROOT' | 'REVOKED' | 'NARROWED';

export interface ExtinguishedGrant {
  grant: Grant;
  reason: ExtinctionReason;
  /**
   * موضع الحلقة التي أطفأتها في السلسلة (`-1` للجذر).
   *
   * ⚠️ **أول** حلقةٍ تُطفئ لا آخرها: التقاطع لا يُنمّي، فما انطفأ عند حلقةٍ
   * لا يعود بعدها. والإصلاح يبدأ من أعلى موضعٍ لا من أدناه.
   */
  atIndex: number;
  /** مَن أطفأها — `null` للجذر (القالب لا شخص). */
  grantorId: string | null;
  granteeId: string | null;
}

/**
 * يقسّم ما مُنح صراحةً في الحلقة الأخيرة إلى نافذٍ ومنطفئ.
 *
 * @param root سقف السلسلة.
 * @param chain الحلقات **من الجذر إلى الورقة** — نفس ترتيب `effectiveGrants`.
 *
 * المخرَج يخصّ **المنحة الأخيرة وحدها**: ما مُنح للورقة. أما ما لم يُمنح لها
 * أصلاً فليس منطفئاً — وخلطهما يجعل كل ما لا يملكه أحدٌ يبدو مسحوباً منه.
 */
export function splitLastLink(
  root: RootGrants,
  chain: readonly DelegationLink[],
): { active: Grant[]; extinguished: ExtinguishedGrant[] } {
  const last = chain[chain.length - 1];
  if (!last) return { active: [], extinguished: [] };

  const effective = effectiveGrants(root, chain);
  const active: Grant[] = [];
  const extinguished: ExtinguishedGrant[] = [];

  for (const g of last.granted) {
    if (effective.has(g)) {
      active.push(g);
      continue;
    }
    extinguished.push(explain(g, root, chain));
  }

  return { active, extinguished };
}

/**
 * يجد **أول** موضعٍ أطفأ الزوج.
 *
 * يمشي من الجذر نزولاً ويقف عند أول رفض. والترتيب مقصود: البحث من الورقة
 * صعوداً يجد آخر حلقةٍ لا تحملها — فيتّهم المفوِّض المباشر بينما السبب قد
 * يكون فوقه بثلاث حلقات.
 */
function explain(g: Grant, root: RootGrants, chain: readonly DelegationLink[]): ExtinguishedGrant {
  if (!root.has(g)) {
    return { grant: g, reason: 'NOT_IN_ROOT', atIndex: -1, grantorId: null, granteeId: null };
  }
  for (let i = 0; i < chain.length; i++) {
    const link = chain[i];
    if (link.revoked) {
      return { grant: g, reason: 'REVOKED', atIndex: i, grantorId: link.grantorId, granteeId: link.granteeId };
    }
    if (!link.granted.has(g)) {
      return { grant: g, reason: 'NARROWED', atIndex: i, grantorId: link.grantorId, granteeId: link.granteeId };
    }
  }
  // لا يُبلَغ: الاستدعاء لا يقع إلا على زوجٍ غير نافذ، وعدم النفاذ لا يكون
  // إلا بأحد الثلاثة أعلاه. ولو بُلغ فذلك تناقضٌ بين `effectiveGrants` وهذه
  // الدالة — والانفجار أصدق من إرجاع سببٍ مخترَع.
  throw new Error(`تناقض: «${g}» غير نافذة ولا سبب لانطفائها في السلسلة`);
}

/**
 * ما يجوز للمفوِّض منحه — وهو **ما يملكه هو**، لا كل ما في الشجرة.
 *
 * قاعدة الواجهة «لا يُعرض ما لا يملكه المفوِّض» تُنفَّذ بهذه: الشجرة تُرشَّح
 * بمخرَجها قبل العرض. وحسابُها في الخادم يمنع الواجهة من تخمين السقف.
 */
export function grantableBy(root: RootGrants, chain: readonly DelegationLink[]): Set<Grant> {
  return effectiveGrants(root, chain);
}
