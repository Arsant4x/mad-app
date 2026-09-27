import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TaskAssigneeKind, TaskPriority } from '@mad-app/db';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { MSG } from '../common/i18n/messages';
import { TenantContext } from '../auth/types';
import { Grant } from '../delegations/permission-tree';
import { PermissionsService } from '../delegations/permissions.service';
import { TaskStatus, assigneeKindOf, currentDueDate, mayTransition } from './task-model';
import { TaskView, viewFor } from './task-visibility';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { ListResult, pageArray } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة لـ«مهامي» (`ق-١٢٣٦`) — العنوانُ والقسم. */
const TASK_SEARCH_FIELDS = ['title', 'department'] as const;

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
  /** فضاءُ `assigneeId` — `OWNER` معرّفُ المنشأة، `USER` معرّفُ حسابٍ فرعيّ (`ق-٦٣٩`). */
  assigneeKind: TaskAssigneeKind;
  targetScreen: string | null;
  targetId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  department: string | null;
  note: string | null;
  recurEveryDays: number;
  dueAnchor: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** سطرٌ من سجل المهمّة — انتقالٌ أو تعليق (من وإلى سواء). */
export interface TaskLogView {
  id: string;
  seq: number;
  actorId: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: Date;
}

export interface MyTaskView extends TaskView {
  status: TaskStatus;
  /** التذكرةُ الداخلية (`SPEC 1.11`): أولويةٌ وقسم — حقلان لا محرّك. */
  priority: TaskPriority;
  department: string | null;
  assigneeId: string;
  assigneeKind: TaskAssigneeKind;
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

  /**
   * مهام الفاعل — **ما كُلِّف به**، لا كل مهام المنشأة (`ق-٦٣٤`: الاسمُ يحمل معناه).
   *
   * ⭐ **والقراءةُ بالوسم والمعرّف معاً** (`ق-٦٣٩`): كان الاستعلامُ `assigneeId = profileId`
   * وحدَه — **وللمالك `profileId` معرّفُ المنشأة الذي لا يكتبه الإسنادُ قطّ**، فعادت
   * «مهامي» فارغةً له **بنجاحٍ وبنيوياً**. والوسمُ يجعل الطرفَين في فضاءٍ واحدٍ بالبناء.
   */
  async mine(tenant: TenantContext, now: Date, query?: PagedQueryDto): Promise<ListResult<MyTaskView>> {
    const rows = await this.rowsFor(tenant);
    const grants = await this.grantsOf(tenant);
    // قائمةٌ محسوبة (الموعدُ والتأخّرُ والانتقالاتُ تُشتقّ لكلّ صفّ): تُرشَّح بالعنوان ثم تُقطَع (`ق-١٢٣٦`).
    return pageArray(query, rows.map((r) => this.toView(r, grants, now)), TASK_SEARCH_FIELDS);
  }

  /**
   * عدّادا لوحة التحكم — **مشتقّان لا مخزَّنان**.
   *
   * ⚠️ ولا استعلامُ `COUNT` على عمود «متأخّرة»: لا عمود كذلك، ولا يجوز أن
   * يوجد. التأخّر دالةُ الزمن، وعمودٌ يحمله يصير كذباً بمرور يوم.
   */
  async counters(tenant: TenantContext, now: Date): Promise<TaskCounters> {
    const rows = await this.rowsFor(tenant); // الاستعلامُ نفسُه الذي تقرأ به «مهامي» — فيتبعانها بالبناء (`ق-٦٣٤`)
    const live = rows.filter((r) => r.status !== 'DONE' && r.status !== 'CANCELLED');
    return {
      open: live.length,
      overdue: live.filter((r) => this.dueOf(r, now) !== null && this.dueOf(r, now)! < now).length,
    };
  }

  /** يُسند مهمة — والإسناد **لا يمنح شيئاً**. */
  async create(
    tenant: TenantContext,
    dto: { title: string; assigneeId: string; assigneeKind: string; targetScreen?: string; targetId?: string; note?: string; recurEveryDays?: number; dueAnchor?: string; priority?: string; department?: string },
    now: Date,
  ): Promise<MyTaskView> {
    /**
     * ⭐ **المكلَّفُ يُتحقَّق منه في فضائه الذي وُسم به** (`ق-٦٣٩`) — لا في فضاءٍ واحدٍ للجميع:
     *   · `USER`  ⇒ حسابٌ فرعيٌّ في هذه المنشأة (كما كان).
     *   · `OWNER` ⇒ **معرّفُ المنشأة نفسِها لا غير** — فالمالكُ واحدٌ ومعرّفُه معلوم،
     *     **ومعرّفُ حسابٍ فرعيٍّ موسومٌ `OWNER` يُرفض** (والقيدُ في القاعدة يمسكه ثانيةً).
     */
    const kind = dto.assigneeKind as TaskAssigneeKind;
    if (kind === TaskAssigneeKind.OWNER) {
      if (dto.assigneeId !== tenant.companyId) throw new NotFoundException(MSG.task_assignee_not_found);
    } else {
      // تحت سياق المنشأة (`ق-٦٥٧` · المرحلة ①) — الجوابُ نفسُه اليوم، ويبقى يوم يُغلق `company_users`.
      const assignee = await this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) =>
        tx.companyUser.findFirst({ where: { id: dto.assigneeId, companyId: tenant.companyId }, select: { id: true } }),
      );
      if (!assignee) throw new NotFoundException(MSG.task_assignee_not_found);
    }

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
      // الأولويةُ من نوع القاعدة (`TaskPriority`) — والقسمُ نصٌّ فارغُه `null` لا `''`.
      const priority = (dto.priority ?? 'NORMAL') as TaskPriority;
      const department = dto.department?.trim() || null;
      const [created] = await tx.$queryRaw<TaskRow[]>`
        INSERT INTO "tasks" ("id", "companyId", "title", "createdById", "assigneeId", "assigneeKind", "targetScreen", "targetId", "status", "note", "recurEveryDays", "dueAnchor", "priority", "department")
        VALUES (gen_random_uuid()::text, ${tenant.companyId}, ${dto.title}, ${tenant.profileId}, ${dto.assigneeId}, ${kind}::"TaskAssigneeKind",
                ${dto.targetScreen ?? null}, ${dto.targetId ?? null}, 'OPEN', ${dto.note ?? null}, ${recur},
                ${dto.dueAnchor ? new Date(dto.dueAnchor) : null}, ${priority}::"TaskPriority", ${department})
        RETURNING *
      `;
      await this.appendLog(tx, tenant, created.id, null, 'OPEN', dto.note ?? null);
      return created;
    });

    return this.toView(row, await this.grantsOf(tenant), now);
  }

  /**
   * ينقل الحالة — **بالتفويض على شاشة المستند، ولطرفَي المهمّة** (`ق-٦٣٦`).
   *
   * فمكلَّفٌ بلا `review` لا يُقفل: **الإسنادُ لا يمنح صلاحية**، وهو ما تنفيه
   * `grantsFromAssignment` صراحةً. **والصلاحيةُ لا تجعل الغريبَ طرفاً**: كان
   * النصُّ هنا «ومَن يملك `review` على تلك الشاشة يُقفل ولو لم تُسنَد إليه» —
   * **فحسابٌ فرعيٌّ يملك `edit` على العقود كان يغيّر حالةَ مهمّةِ غيره بمعرّفها**،
   * وهي التي لا تعرضها له «مهامي». **قِيس بالتشغيل**: `Expected 403 · Received 200`.
   *
   * ⚠️ **ومن عائلة عزل الفروع**: **ما تحجبه القائمةُ يفتحه مسارٌ بمعرّف** —
   * فالحراسةُ على المسار لا على القائمة.
   *
   * ## الشرطان معاً، والمالكُ معفى
   *
   * **①** الفاعلُ طرفٌ (المكلَّف أو المُسنِد) — **على قاعدة التعليق والسجلّ نصّاً**
   * (`partyTask`)، **والمالكُ معفىً كما في ورديات نقطة البيع** (`pos.service.ts`:
   * `openedById !== profileId && actorType !== 'COMPANY'`) — فلا يُنقَص منه ما كان
   * له، **ومصيرُ علاقته بالمهامّ يحسمه `ق-٦٣٥` لا هذا الإصلاح**.
   * **②** ثمّ التفويضُ على شاشة المستند كما كان.
   */
  async transition(tenant: TenantContext, id: string, to: TaskStatus, note: string | null, now: Date): Promise<MyTaskView> {
    const task = await this.partyTask(tenant, id, { ownerExempt: true, message: MSG.task_transition_not_party });

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

  /**
   * **تعليقٌ بلا انتقال** (`SPEC 1.11` · `ق-٥٣٢`): سطرٌ في السجل حالتُه من وإلى
   * سواء — **والحالةُ لا تُمسّ**. **ولطرفَي المهمّة وحدهما** (المكلَّفُ والمُسنِد):
   * فالتذكرةُ حوارٌ بين من رفعها ومن يعالجها، **ولا يُفتح على غيرهما** —
   * والمحرّكُ لا يُبنى ثانياً، حقلٌ وسطرٌ فيه.
   */
  async comment(tenant: TenantContext, id: string, note: string, now: Date): Promise<MyTaskView> {
    const task = await this.partyTask(tenant, id);
    await this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) => this.appendLog(tx, tenant, id, task.status, task.status, note));
    return this.toView(task, await this.grantsOf(tenant), now);
  }

  /** سجلُّ المهمّة — انتقالاتُها وتعليقاتُها بترتيبها، **لطرفيها وحدهما**. */
  async log(tenant: TenantContext, id: string): Promise<TaskLogView[]> {
    await this.partyTask(tenant, id);
    return this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) =>
      tx.$queryRaw<TaskLogView[]>`
        SELECT "id", "seq", "actorId", "fromStatus", "toStatus", "note", "createdAt"
          FROM "task_logs" WHERE "taskId" = ${id} ORDER BY "seq" ASC
      `,
    );
  }

  // ═══════════════════ الداخلية ═══════════════════

  /**
   * المهمّةُ بطرفيها — وغيرُهما يُردّ `403` لا `404`: وجودُها معلومٌ من الإسناد، وحوارُها ليس له.
   *
   * ⭐ **والمكلَّفُ يُقارَن في فضائه الموسوم** (`ق-٦٣٩`): `(assigneeKind, assigneeId)` مع
   * `(فضاءُ الفاعل, profileId)` — فلا تعود مقارنةَ فضاءَين تمرّ دائماً (`ق-٦٢٩`).
   * **و`createdById` يُكتب من `profileId` فيُقارَن به في فضائه نفسِه** — وهو من الأعمدة
   * التسعة والأربعين بلا وسم (`ق-٦٤١`)، يُقاس أثرُها حين يُمسّ. ومن استثنى المالكَ
   * (`ownerExempt`) قال ذلك صراحةً، لا سهواً.
   */
  private async partyTask(tenant: TenantContext, id: string, opts: { ownerExempt?: boolean; message?: string } = {}): Promise<TaskRow> {
    const rows = await this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) => tx.$queryRaw<TaskRow[]>`SELECT * FROM "tasks" WHERE "id" = ${id}`);
    const task = rows[0];
    if (!task) throw new NotFoundException(MSG.task_not_found);
    if (opts.ownerExempt && tenant.actorType === 'COMPANY') return task;
    if (!this.isAssignee(task, tenant) && task.createdById !== tenant.profileId) throw new ForbiddenException(opts.message ?? MSG.task_comment_forbidden);
    return task;
  }

  /** الفاعلُ هو المكلَّف — **بالوسم والمعرّف معاً**، لا بالمعرّف وحدَه. */
  private isAssignee(task: TaskRow, tenant: TenantContext): boolean {
    const kind = assigneeKindOf(tenant.actorType);
    return kind !== null && task.assigneeKind === kind && task.assigneeId === tenant.profileId;
  }

  /**
   * ⚠️ تحت سياق المستأجر — `tasks` عليه `RLS ENABLE + FORCE`، وقراءةٌ
   * خارجه تعود **فارغةً بنجاح**: «لا مهام» و«لم أرَ شيئاً» يبدوان سواء.
   *
   * ⭐ **والاستعلامُ بالوسم والمعرّف معاً** (`ق-٦٣٩`): فاعلٌ لا فضاءَ له (مديرُ منصّة)
   * يُردّ فارغاً **بقرارٍ لا بعمى** — فهو ليس مكلَّفاً ممكناً أصلاً.
   */
  private rowsFor(tenant: TenantContext): Promise<TaskRow[]> {
    const kind = assigneeKindOf(tenant.actorType);
    if (kind === null) return Promise.resolve([]);
    return this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) =>
      // `id` ختماً للترتيب (`ق-٣٥٦`): «مهامي» تُقطَع في الذاكرة، ومهمّتان في المللي‑ثانية نفسها لا تتبدّلان بين صفحتين.
      tx.$queryRaw<TaskRow[]>`SELECT * FROM "tasks" WHERE "assigneeKind" = ${kind}::"TaskAssigneeKind" AND "assigneeId" = ${tenant.profileId} ORDER BY "createdAt" DESC, "id" DESC`,
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
      priority: r.priority,
      department: r.department,
      assigneeId: r.assigneeId,
      assigneeKind: r.assigneeKind,
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
