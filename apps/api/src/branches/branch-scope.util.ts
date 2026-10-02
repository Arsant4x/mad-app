import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { formatMessage, MSG } from '../common/i18n/messages';

/**
 * Branch visibility, expressed once so every list query filters it the same way.
 *
 * This is deliberately **not** a Prisma extension like tenant scoping is. The
 * company boundary is absolute and must be impossible to forget, so it's
 * centralized and backed by RLS. A branch restriction is a permission: the
 * owner sees everything, an employee flagged `allBranches` sees everything (`ق-١٤٦٨` —
 * an unassigned employee without the flag sees company-wide rows only), and rows with
 * no branch at all (every row predating branches, and every single-location
 * business) must stay visible to everyone. Encoding that in a blanket
 * extension would silently hide legitimate data.
 */

/** Rows with `branchId: null` are company-wide, not "belonging to no branch" —
 * they stay visible to a branch-restricted employee, otherwise every pre-branch
 * record would vanish from their screens. */
export function branchFilter(allowedBranchIds: string[] | 'all'): { branchId?: { in: string[] } | null } | Record<string, never> {
  if (allowedBranchIds === 'all') return {};
  return { OR: [{ branchId: { in: allowedBranchIds } }, { branchId: null }] } as never;
}

/**
 * **فروعُ القارئ وحدَها** (توجيه ٢٧٥ · `ق-١٥٨٠`): لرقمٍ مجمَّعٍ يُعرض لموظّفٍ مقيَّد، كبطاقات لوحة التحكم.
 *
 * بخلاف `branchFilter` لا يدخل فيه صفُّ المنشأة كلِّها (بلا فرع): ذاك يُرى في القائمة صفّاً صفّاً، وفي المجموع يصير جزءاً
 * من رقم المنشأة الذي لا يُعطى للمقيَّد (`ق-١٥٨١`). وبلا فرعٍ مسنَد (`[]`) لا صفَّ يدخل، فالرقمُ صفر.
 */
export function ownBranchesFilter(allowedBranchIds: string[] | 'all'): { branchId?: { in: string[] } } {
  if (allowedBranchIds === 'all') return {};
  return { branchId: { in: allowedBranchIds } };
}

/**
 * **فرعٌ يطلبه التقرير من الاستعلام** — `?branchId=` — **يُقاس على فروع القارئ
 * قبل أن يصير مرشِّحاً** (`ق-٥١٧`).
 *
 * كانت التقاريرُ تأخذ `query.branchId` كما وصل: **فموظّفٌ مقصورٌ على فرعٍ يطلب
 * مرتجعاتِ فرعٍ آخر باسمه فيراها** — **بابٌ جانبيٌّ إلى الصفوف نفسِها التي
 * تحجبها القائمة**. وبلا فرعٍ مطلوب تُرشَّح بفروع القارئ كالقائمة سواء.
 *
 * ⚠️ **وحارسُ القراءة يقرأ من هذا الملفّ كلَّ دالّةٍ مُصدَّرةٍ ينتهي اسمُها
 * بـ`Filter` مرشِّحاً** — فمرشِّحٌ جديد يُكتب هنا بهذا الاسم ويدخل الحراسةَ
 * بلا لمس الحارس، **ودالّةٌ باسمٍ آخر لا تُقرأ مرشِّحاً ولو رشّحت**.
 */
export function requestedBranchFilter(allowedBranchIds: string[] | 'all', branchId: string | null | undefined): { branchId: string } | ReturnType<typeof branchFilter> {
  if (branchId) {
    assertBranchAllowed(allowedBranchIds, branchId);
    return { branchId };
  }
  return branchFilter(allowedBranchIds);
}

/** Guards a *write* aimed at a specific branch. Reads are filtered; writes are
 * rejected outright, because silently dropping a write the caller believes
 * succeeded is worse than an explicit refusal. */
export function assertBranchAllowed(allowedBranchIds: string[] | 'all', branchId: string | null | undefined): void {
  if (allowedBranchIds === 'all') return;
  if (!branchId) return; // company-wide write, not aimed at a branch
  if (!allowedBranchIds.includes(branchId)) {
    throw new ForbiddenException(MSG.branch_forbidden);
  }
}

/**
 * Validates a `branchId` arriving on a request body before it's stored.
 *
 * Two separate checks, both needed: the branch must exist **in this company**
 * (a bare foreign id off a request body is never trusted — RLS hides another
 * company's row from the read, but nothing stops the FK column itself from
 * accepting it), and the caller must be allowed to write to it.
 *
 * Pass `tx` from `runInTenantContext`, never the raw client: `branches` is
 * RLS-protected and a raw read here finds nothing.
 */
export async function resolveBranchId(
  tx: Prisma.TransactionClient,
  branchId: string | null | undefined,
  allowedBranchIds: string[] | 'all',
  use: BranchWriteUse = 'new',
): Promise<string | null> {
  if (branchId === undefined) return null;
  if (branchId === null || branchId === '') return null;

  const [branch] = await readBranchesForWrite(tx, [branchId]);
  if (!branch) throw new NotFoundException(MSG.branch_not_found);

  assertBranchAllowed(allowedBranchIds, branchId);
  if (use === 'new') assertBranchesOpen([branch]);
  return branch.id;
}

/**
 * ⚖️ **ما يُكتب في الفرع** (`ق-١٤٥٣`): `new` — مستندٌ أو إسنادٌ جديدٌ يختاره الطلب، **فالمغلقُ يرفضه** · `mirror` — عكسٌ أو
 * إلغاءٌ يحمل فرعَ أصله كما هو، **فيمضي**: تصحيحُ التاريخ ليس نشاطاً جديداً في الفرع.
 */
export type BranchWriteUse = 'new' | 'mirror';

interface BranchForWrite {
  id: string;
  name: string;
  closedAt: Date | null;
}

/**
 * يقرأ الفروعَ **بقفل المفتاح المشترك** (`FOR KEY SHARE`) — وهو ما يأخذه إدراجُ المفتاح الأجنبيّ على الصفّ نفسِه على كلّ حال.
 * **فإغلاقٌ متزامن** (`FOR UPDATE` في `BranchesService.close`) **ينتظره أو ينتظرُه**: إمّا يُغلق بعد أن يُكتب المستندُ فيرى
 * أثرَه، وإمّا يقرأ هذا الفرعَ بعد الإغلاق فيرفض — ولا يقع مستندٌ في فرعٍ أُغلق بين قراءته وكتابته.
 */
async function readBranchesForWrite(tx: Prisma.TransactionClient, ids: string[]): Promise<BranchForWrite[]> {
  return tx.$queryRaw<BranchForWrite[]>`SELECT "id", "name", "closedAt" FROM "branches" WHERE "id" = ANY(${ids}::text[]) FOR KEY SHARE`;
}

/** 🔴 المغلقُ لا مستندَ جديدٌ فيه ولا يُسنَد إليه جديد — يُرفض مسمّىً ويدلّ على إعادة الفتح أو فرعٍ آخر. */
function assertBranchesOpen(branches: BranchForWrite[]): void {
  const closed = branches.filter((b) => b.closedAt);
  if (closed.length) throw new ConflictException(formatMessage(MSG.branch_closed, { name: closed.map((b) => b.name).join('" · "') }));
}

/**
 * فروعٌ تُسنَد إلى حساب دخول (`ق-١٤٥٣`): **مغلقٌ منها يُرفض** — فالإغلاقُ يشترط أن لا حسابَ مُسنَدٌ إليه، وإسنادٌ بعده
 * يلتفّ على الشرط. **يُقرأ بالقفل نفسِه** فلا يسبقه إغلاقٌ متزامن.
 */
export async function assertBranchIdsOpen(tx: Prisma.TransactionClient, branchIds: string[]): Promise<void> {
  if (branchIds.length === 0) return;
  assertBranchesOpen(await readBranchesForWrite(tx, branchIds));
}

/**
 * 🔴 **مستندٌ في فرعٍ لا يستعمل صندوقَ فرعٍ آخر** (`ق-١٤٣٧`) — المخطَّطُ يقول إن صندوقَ الفرع صفُّ `Bank` يشير إليه
 * (`Bank.branchId` · `CLAUDE.md §6.8`)، والشيفرةُ كانت تقرأ الصندوقَ بمعرّفه ولا تقيسه بفرع المستند.
 *
 * **والحدّ**: صندوقُ المنشأة كلِّها (بلا فرع) لكلِّ فرع · **والمستندُ بلا فرعٍ خارجُ الحكم** (معلَنٌ لا مغطّى) · **والمرآةُ**
 * (عكسُ سندٍ أو إلغاؤه) تحمل صندوقَ أصلها وفرعَه كما هما، فلا تُقاس. يُستدعى بعد أن يُعرف الفرعان وقبل أيّ كتابة.
 */
export async function assertBoxInBranch(
  tx: Prisma.TransactionClient,
  documentBranchId: string | null | undefined,
  box: { name: string; branchId: string | null } | null | undefined,
): Promise<void> {
  if (!box || !documentBranchId || !box.branchId || box.branchId === documentBranchId) return;
  const names = await tx.branch.findMany({ where: { id: { in: [documentBranchId, box.branchId] } }, select: { id: true, name: true } });
  const nameOf = (id: string) => names.find((b) => b.id === id)?.name ?? id;
  throw new ConflictException(formatMessage(MSG.document_box_other_branch, { box: box.name, boxBranch: nameOf(box.branchId), branch: nameOf(documentBranchId) }));
}
