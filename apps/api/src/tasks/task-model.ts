import { TaskPriority } from '@prisma/client';
import { ALLOWED_SCREENS, ScreenAction } from '../templates/screens';

/**
 * الأولويات — **مقروءةً من نوع القاعدة لا منسوخة** (`SPEC 14.2`): القائمةُ
 * المغلقةُ في `TaskPriority` هي المصدر، وهذه إسقاطُها للتحقّق في `DTO`.
 */
export const TASK_PRIORITIES = Object.values(TaskPriority) as readonly TaskPriority[];
import { Grant, grant } from '../delegations/permission-tree';
import { DelegationLink, hasGrant, RootGrants } from '../delegations/intersection';

/**
 * نموذج المهمة — الحالة والانتقالات والجدولة.
 *
 * ثلاثة قرارات تحكمه، وكلٌّ منها يمنع عطلاً معروفاً في هذا المشروع.
 */

/* ═══════════════ ① الرابطة متعددة الأشكال ═══════════════ */

/**
 * أنواع الكيانات التي تُربط بها مهمة — **مشتقّة من `ALLOWED_SCREENS` لا
 * مكتوبة**.
 *
 * ⚠️ نصٌّ حرّ هنا يفتح الباب لكيانات مخترَعة: `invoices` بدل `invoice`،
 * و`audit-log` بدل `audit`. وهي **عائلة خطأ الأسماء الخمسة عشر** التي وقعت
 * في شجرة الصلاحيات — كُتبت من مسارات الشريط الجانبي لا من السجل، فابتلعها
 * المرشِّح صامتاً.
 *
 * والاشتقاق يجعل الخطأ **مستحيلاً بالأنواع** لا مرفوضاً وقت التشغيل:
 * `TaskEntityType` هو `ALLOWED_SCREENS[number]` نفسه.
 */
export type TaskEntityType = (typeof ALLOWED_SCREENS)[number];

export const isTaskEntityType = (v: string): v is TaskEntityType =>
  (ALLOWED_SCREENS as readonly string[]).includes(v);

/* ═══════════════ ② الحالة والانتقالات ═══════════════ */

/** حالات المهمة — قائمة مغلقة، لا حقل نصّي حرّ. */
export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * الانتقالات المسموحة، ومَن يستطيعها.
 *
 * `action` هو الفعل المطلوب على **شاشة المستند المرتبط** — فالانتقال يُحكم
 * بالتفويض لا بملكية المهمة. ومهمةٌ بلا مستند تُحكم بشاشة `dashboard`
 * (وجودها لكل من يدخل المنصة).
 *
 * ⚠️ **ولا انتقال من حالة نهائية:** `DONE` و`CANCELLED` لا يخرج منهما شيء.
 * إعادة الفتح **مهمة جديدة** — وإلا صار السجل يروي قصةً غير التي وقعت.
 */
const TRANSITIONS: Readonly<Record<TaskStatus, readonly { to: TaskStatus; action: ScreenAction }[]>> = {
  OPEN: [
    { to: 'IN_PROGRESS', action: 'edit' },
    { to: 'BLOCKED', action: 'edit' },
    { to: 'CANCELLED', action: 'delete' },
  ],
  IN_PROGRESS: [
    { to: 'BLOCKED', action: 'edit' },
    { to: 'DONE', action: 'review' },
    { to: 'CANCELLED', action: 'delete' },
  ],
  BLOCKED: [
    { to: 'IN_PROGRESS', action: 'edit' },
    { to: 'CANCELLED', action: 'delete' },
  ],
  DONE: [],
  CANCELLED: [],
};

export const allowedTransitions = (from: TaskStatus): readonly TaskStatus[] =>
  TRANSITIONS[from].map((t) => t.to);

/**
 * هل يستطيع هذا الفاعل هذا الانتقال؟
 *
 * **الشرطان معاً:** الانتقال مسموحٌ في الآلة، **والفاعل يملك فعله** عبر
 * سلسلة تفويضه. فمكلَّفٌ بمهمة لا يستطيع إقفالها (`review`) إن لم يملك
 * المراجعة — **التكليف لا يمنح** (انظر `task-visibility.ts`).
 */
export function mayTransition(
  from: TaskStatus,
  to: TaskStatus,
  entityType: TaskEntityType | null,
  root: RootGrants,
  chain: readonly DelegationLink[],
): boolean {
  const rule = TRANSITIONS[from].find((t) => t.to === to);
  if (!rule) return false;
  const screen = entityType ?? 'dashboard';
  return hasGrant(root, chain, grant(screen, rule.action) as Grant);
}

/* ═══════════════ ③ الجدولة عند القراءة ═══════════════ */

/**
 * تكرار المهمة الروتينية — **بلا cron وبلا مهمة خلفية**.
 *
 * نظير انتهاء عروض الأسعار: الحالة **تُشتقّ من التاريخ عند القراءة**، فلا
 * وظيفةٌ دورية تتأخر أو تُنسى أو تعمل مرتين. ومهمةٌ روتينية لم تُقرأ لا
 * يهمّ أنها لم تُولَّد — لأن التوليد نفسه اشتقاق.
 *
 * ⚠️ والفارق ليس أداءً: cron يصنع **حالةً مخزَّنة** تختلف عن الحقيقة بين
 * تشغيلين، فيصير «متى وُلِّدت» سؤالاً. والاشتقاق لا يعرف هذا السؤال.
 */
export interface Recurrence {
  /** كل كم يوماً. `0` أو أقل = غير متكرّرة. */
  everyDays: number;
  /** أول موعد استحقاق. */
  anchor: Date;
}

const DAY_MS = 86_400_000;

/**
 * موعد الاستحقاق الحالي لمهمة روتينية، محسوباً **الآن**.
 *
 * @param now يُمرَّر صراحةً — لا `new Date()` داخل الدالة، فالاختبار يحقن
 *   الزمن ولا ينتظر مروره.
 */
export function currentDueDate(rec: Recurrence, now: Date): Date {
  if (rec.everyDays <= 0) return rec.anchor;
  const elapsed = now.getTime() - rec.anchor.getTime();
  if (elapsed < 0) return rec.anchor;
  const periods = Math.floor(elapsed / (rec.everyDays * DAY_MS));
  return new Date(rec.anchor.getTime() + periods * rec.everyDays * DAY_MS);
}

/** كم دورة استحقّت منذ المرساة حتى الآن — للعرض والمتابعة. */
export function occurrencesDue(rec: Recurrence, now: Date): number {
  if (rec.everyDays <= 0) return now >= rec.anchor ? 1 : 0;
  const elapsed = now.getTime() - rec.anchor.getTime();
  if (elapsed < 0) return 0;
  return Math.floor(elapsed / (rec.everyDays * DAY_MS)) + 1;
}

/** هل المهمة متأخرة الآن؟ مشتقّة كذلك — لا عمود `isOverdue` يُحدَّث. */
export const isOverdue = (rec: Recurrence, now: Date, status: TaskStatus): boolean =>
  status !== 'DONE' && status !== 'CANCELLED' && now.getTime() > currentDueDate(rec, now).getTime();
