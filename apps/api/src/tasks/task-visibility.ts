import { Grant, grant } from '../delegations/permission-tree';
import { DelegationLink, hasGrant, RootGrants } from '../delegations/intersection';

/**
 * رؤية المهام — **تُبنى فوق التفويض لا بجواره**.
 *
 * ## القاعدة الحاكمة (قرار المالك 2026-08-12)
 *
 * > المكلَّف **يرى وجود المهمة** ولا يرى **محتوى المستند**.
 *
 * وبدونها تصير المهام **باباً خلفياً على الصلاحيات كلها**: يكفي أن يُكلَّف
 * أحدهم بمهمة على فاتورة ليقرأ الفاتورة — فيلتفّ على `@RequiresScreen`
 * و`@RequiresAction` والتفويض معاً بخطوةٍ واحدة.
 *
 * ## ولا نظام صلاحيات ثالث
 *
 * لا تعرّف هذه الوحدة صلاحيةً جديدة ولا جدول أذونات. تسأل **نظام التفويض
 * القائم** (`hasGrant`) بمفرداته نفسها (`شاشة:فعل`) — فالمهمة **مستهلكة**
 * للصلاحيات لا مُنتجة لها. وهو ما يجعل السحب يسري عليها فوراً كذلك: لا
 * نسخة تحتفظ بها المهمة.
 */

/** رابطة متعددة الأشكال: أي مستند في أي وحدة. */
export interface TaskTarget {
  /** الشاشة التي ينتمي إليها المستند — من `ALLOWED_SCREENS` لا اسمٌ حر. */
  screen: string;
  entityId: string;
}

export interface TaskLike {
  id: string;
  title: string;
  assigneeId: string;
  target: TaskTarget | null;
}

/** ما يراه المكلَّف فعلاً. */
export interface TaskView {
  id: string;
  title: string;
  target: TaskTarget | null;
  /**
   * هل يُسمح بفتح المستند؟
   *
   * ⚠️ **حقلٌ محسوب لا مخزَّن**: تخزينه يعني نسخةً تتقادم عند أول سحب —
   * وهو العطل الذي تجنّبه التقاطع الحيّ أصلاً.
   */
  canOpenTarget: boolean;
}

/**
 * يبني ما يراه المكلَّف من مهمة.
 *
 * **العنوان يظهر دائماً** — وهو «وجود المهمة». **والمستند لا يُفتح** إلا
 * إذا كان المكلَّف يملك `view` على شاشته عبر سلسلة تفويضه.
 *
 * @param root سقف صلاحيات المكلَّف.
 * @param chain سلسلة تفويضه — تُقرأ حيّةً عند كل طلب.
 */
export function viewFor(task: TaskLike, root: RootGrants, chain: readonly DelegationLink[]): TaskView {
  return {
    id: task.id,
    title: task.title,
    target: task.target,
    canOpenTarget: task.target ? hasGrant(root, chain, grant(task.target.screen, 'view') as Grant) : false,
  };
}

/**
 * الحارس عند فتح المستند — **يُستدعى قبل أي قراءة**.
 *
 * ⚠️ **لا يكفي إخفاء الزر**: `canOpenTarget: false` يمنع العرض، ولا يمنع
 * طلباً مباشراً على نقطة النهاية. فالمنع هنا، ويُستدعى من المسار لا من
 * الواجهة.
 */
export function mayOpenTarget(
  target: TaskTarget,
  root: RootGrants,
  chain: readonly DelegationLink[],
): boolean {
  return hasGrant(root, chain, grant(target.screen, 'view') as Grant);
}

/**
 * تكليفٌ بمهمة **لا يمنح شيئاً**.
 *
 * دالةٌ صريحة لتوثيق نفيٍ: لا يوجد — ولا يجوز أن يوجد — مسارٌ يوسّع صلاحية
 * المكلَّف بسبب التكليف. وُضعت ليقرأها من يبني الإسناد لاحقاً فلا يُضيف
 * «منح مؤقت» بحسن نية.
 */
export function grantsFromAssignment(): ReadonlySet<Grant> {
  return new Set<Grant>();
}
