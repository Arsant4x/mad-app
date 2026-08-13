import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { MSG } from '../common/i18n/messages';
import { TenantContext } from '../auth/types';
import { Grant } from '../delegations/permission-tree';
import { PermissionsService } from '../delegations/permissions.service';
import { TaskStatus, currentDueDate, mayTransition } from './task-model';
import { TaskView, viewFor } from './task-visibility';

/**
 * المهام — **مبنيّةٌ فوق التفويض لا بجانبه**.
 *
 * ## القواعد الثلاث التي يفرضها هذا الملف
 *
 * ① **المكلَّف يرى وجود المهمة ولا يرى محتوى المستند.** ما يُعاد هو
 *    `TaskView`: عنوانٌ وهدفٌ و`canOpenTarget`. ولا حرفٌ من المستند نفسه
 *    يمرّ من هنا — فمن كُلِّف بمراجعة عقدٍ لا يملك `contracts:view` يعرف
 *    **أن هناك مهمة** ولا يقرأ العقد.
 *
 * ② **`canOpenTarget` محسوبٌ لا مخزَّن.** يُشتقّ من الصلاحيات النافذة عند
 *    كل قراءة. وتخزينه يعني نسخةً تتقادم عند أول سحب — وهو بعينه العطل
 *    الذي تجنّبه التقاطع الحيّ. ولا عمود له في `tasks` (حارسٌ يقرأ الترحيل).
 *
 * ③ **الموعد والتأخّر بالاشتقاق.** `currentDueDate` تُحسب من `everyDays`
 *    و`anchor` عند القراءة — لا عمود «الموعد القادم» ولا مهمة خلفية
 *    تُحدّثه. قرار المرحلة الثانية: وظيفةٌ دورية تصنع حالةً تختلف عن
 *    الحقيقة بين تشغيلين، فيصير «متى وُلِّدت» سؤالاً.
 *
 * ## ولماذا تُقرأ الصلاحيات من `PermissionsService`
 *
 * لا نسخةَ حسابٍ ثانية. `forActor` هو ما تقرأه الواجهة نفسها، فما يراه
 * المكلَّف هنا وما يراه زرُّه هناك مصدرهما واحد. وحسابٌ محلّيٌّ هنا يفترق
 * عنه عند أول تعديل، **بلا شكوى**.
 */

/** صفٌّ خام من `tasks`. */
interface TaskRow {
  id: string;
  companyId: string;
  title: string;
  createdById: string;
  assigneeId: string;
  targetScreen: string | null;
  targetId: string | null;
  status: TaskStatus;
  note: string | null;
  recurEveryDays: number;
  dueAnchor: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MyTaskView extends TaskView {
  status: TaskStatus;
  assigneeId: string;
  createdById: string;
  /** الموعد الحالي — مشتقٌّ، و`null` لمهمةٍ بلا موعد. */
  dueAt: Date | null;
  isOverdue: boolean;
  /** الانتقالات المسموحة **لهذا الفاعل الآن** — لا كل الانتقالات الممكنة. */
  allowedTransitions: TaskStatus[];
}

export interface TaskCounters {
  open: number;
  overdue: number;
}

const TRANSITION_TARGETS: readonly TaskStatus[] = ['IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  /** مهام الفاعل — **ما كُلِّف به**، لا كل مهام المنشأة. */
  async mine(tenant: TenantContext, now: Date): Promise<MyTaskView[]> {
    const rows = await this.rowsFor(tenant.companyId, tenant.profileId);
    const grants = await this.grantsOf(tenant);
    return rows.map((r) => this.toView(r, grants, now));
  }

  /**
   * عدّادا لوحة التحكم — **مشتقّان لا مخزَّنان**.
   *
   * ⚠️ ولا استعلامُ `COUNT` على عمود «متأخّرة»: لا عمود كذلك، ولا يجوز أن
   * يوجد. التأخّر دالةُ الزمن، وعمودٌ يحمله يصير كذباً بمرور يوم.
   */
  async counters(tenant: TenantContext, now: Date): Promise<TaskCounters> {
    const rows = await this.rowsFor(tenant.companyId, tenant.profileId);
    const live = rows.filter((r) => r.status !== 'DONE' && r.status !== 'CANCELLED');
    return {
      open: live.length,
      overdue: live.filter((r) => this.dueOf(r, now) !== null && this.dueOf(r, now)! < now).length,
    };
  }

  /** يُسند مهمة — والإسناد **لا يمنح شيئاً**. */
  async create(
    tenant: TenantContext,
    dto: { title: string; assigneeId: string; targetScreen?: string; targetId?: string; note?: string; recurEveryDays?: number; dueAnchor?: string },
    now: Date,
  ): Promise<MyTaskView> {
    const assignee = await this.prisma.companyUser.findFirst({ where: { id: dto.assigneeId, companyId: tenant.companyId }, select: { id: true } });
    if (!assignee) throw new NotFoundException(MSG.task_assignee_not_found);

    // ⚠️ الرابطة كلٌّ أو لا شيء — تُفحص هنا **وفي القاعدة**. الفحص هنا
    // يعطي رسالةً عربية، والقيد هناك يمسك ما لا يمرّ بهذه الدالة.
    if ((dto.targetScreen == null) !== (dto.targetId == null)) throw new BadRequestException(MSG.task_target_incomplete);

    const recur = dto.recurEveryDays ?? 0;
    if (recur > 0 && !dto.dueAnchor) throw new BadRequestException(MSG.task_recurrence_needs_anchor);

    /**
     * ⚠️ **المُسنِد يجب أن يرى المستند الذي يربطه.**
     *
     * وإلا صار الإسناد قناةَ تسريب معكوسة: من لا يملك `contracts:view`
     * يربط مهمةً بعقدٍ لم يره، فيكشف **وجوده ومعرّفه** لمن يفتحه. والقاعدة
     * الأصلية («المكلَّف يرى وجود المهمة ولا يرى المستند») تحرس الطرف
     * الآخر وحده.
     */
    if (dto.targetScreen) {
      const grants = await this.grantsOf(tenant);
      if (!grants.has(`${dto.targetScreen}:view` as Grant)) throw new ForbiddenException(MSG.task_target_not_visible);
    }

    const row = await this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const [created] = await tx.$queryRaw<TaskRow[]>`
        INSERT INTO "tasks" ("id", "companyId", "title", "createdById", "assigneeId", "targetScreen", "targetId", "status", "note", "recurEveryDays", "dueAnchor")
        VALUES (gen_random_uuid()::text, ${tenant.companyId}, ${dto.title}, ${tenant.profileId}, ${dto.assigneeId},
                ${dto.targetScreen ?? null}, ${dto.targetId ?? null}, 'OPEN', ${dto.note ?? null}, ${recur},
                ${dto.dueAnchor ? new Date(dto.dueAnchor) : null})
        RETURNING *
      `;
      await this.appendLog(tx, tenant, created.id, null, 'OPEN', dto.note ?? null);
      return created;
    });

    return this.toView(row, await this.grantsOf(tenant), now);
  }

  /**
   * ينقل الحالة — **بالتفويض على شاشة المستند لا بملكية المهمة**.
   *
   * فمكلَّفٌ بلا `review` لا يُقفل، ومَن يملك `review` على تلك الشاشة يُقفل
   * ولو لم تُسنَد إليه. والملكية تحدّد **مَن يراها**، والتفويض يحدّد **ما
   * يفعله بها** — خلطُهما يجعل الإسناد يمنح صلاحية، وهو ما تنفيه
   * `grantsFromAssignment` صراحةً.
   */
  async transition(tenant: TenantContext, id: string, to: TaskStatus, note: string | null, now: Date): Promise<MyTaskView> {
    const rows = await this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) =>
      tx.$queryRaw<TaskRow[]>`SELECT * FROM "tasks" WHERE "id" = ${id}`,
    );
    const task = rows[0];
    if (!task) throw new NotFoundException(MSG.task_not_found);

    const grants = await this.grantsOf(tenant);
    if (!mayTransition(task.status, to, task.targetScreen as never, grants, [])) {
      throw new ForbiddenException(MSG.task_transition_forbidden);
    }

    const updated = await this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const [row] = await tx.$queryRaw<TaskRow[]>`
        UPDATE "tasks" SET "status" = ${to} WHERE "id" = ${id} RETURNING *
      `;
      await this.appendLog(tx, tenant, id, task.status, to, note);
      return row;
    });

    return this.toView(updated, grants, now);
  }

  // ═══════════════════ الداخلية ═══════════════════

  /**
   * ⚠️ تحت سياق المستأجر — `tasks` عليه `RLS ENABLE + FORCE`، وقراءةٌ
   * خارجه تعود **فارغةً بنجاح**: «لا مهام» و«لم أرَ شيئاً» يبدوان سواء.
   */
  private rowsFor(companyId: string, assigneeId: string): Promise<TaskRow[]> {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.$queryRaw<TaskRow[]>`SELECT * FROM "tasks" WHERE "assigneeId" = ${assigneeId} ORDER BY "createdAt" DESC`,
    );
  }

  /** الصلاحيات النافذة — من **نفس** المصدر الذي تقرأه الواجهة. */
  private async grantsOf(tenant: TenantContext): Promise<Set<Grant>> {
    const { grants } = await this.permissions.forActor(tenant);
    return new Set(grants);
  }

  private dueOf(r: TaskRow, now: Date): Date | null {
    if (!r.dueAnchor) return null;
    return currentDueDate({ everyDays: r.recurEveryDays, anchor: new Date(r.dueAnchor) }, now);
  }

  /**
   * الصفّ ⇒ ما يراه المكلَّف.
   *
   * ⚠️ `root = grants` و`chain = []` مقصود: `grants` **هي نتيجة التقاطع
   * أصلاً**. وتمريرُ سلسلةٍ ثانية هنا يقاطعها مرّتين.
   */
  private toView(r: TaskRow, grants: Set<Grant>, now: Date): MyTaskView {
    const target = r.targetScreen && r.targetId ? { screen: r.targetScreen, entityId: r.targetId } : null;
    const base = viewFor({ id: r.id, title: r.title, assigneeId: r.assigneeId, target }, grants, []);
    const dueAt = this.dueOf(r, now);
    return {
      ...base,
      status: r.status,
      assigneeId: r.assigneeId,
      createdById: r.createdById,
      dueAt,
      isOverdue: dueAt !== null && dueAt < now && r.status !== 'DONE' && r.status !== 'CANCELLED',
      allowedTransitions: TRANSITION_TARGETS.filter((t) => mayTransition(r.status, t, r.targetScreen as never, grants, [])),
    };
  }

  /**
   * يُلحق قيداً بسجل المهام.
   *
   * ⚠️ `seq` يُقرأ داخل نفس المعاملة، والفهرس الفريد `(companyId, seq)`
   * يرفض المتزامنَين — **وهو التصرّف الصحيح**: ترقيمٌ متساهل يفتح فجوةً،
   * وكشف الفجوة هو الإشارة الوحيدة على عبثٍ نجا من المُشغِّلات.
   */
  private async appendLog(
    tx: { $queryRaw: <T>(q: TemplateStringsArray, ...v: unknown[]) => Promise<T>; $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<number> },
    tenant: TenantContext,
    taskId: string,
    from: TaskStatus | null,
    to: TaskStatus,
    note: string | null,
  ): Promise<void> {
    const [last] = await tx.$queryRaw<{ seq: number }[]>`SELECT COALESCE(MAX("seq"), 0) AS seq FROM "task_logs"`;
    await tx.$executeRaw`
      INSERT INTO "task_logs" ("id", "companyId", "seq", "taskId", "actorId", "fromStatus", "toStatus", "note")
      VALUES (gen_random_uuid()::text, ${tenant.companyId}, ${Number(last.seq) + 1}, ${taskId}, ${tenant.profileId}, ${from}, ${to}, ${note})
    `;
  }
}
