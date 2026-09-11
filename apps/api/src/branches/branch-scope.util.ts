import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MSG } from '../common/i18n/messages';

/**
 * Branch visibility, expressed once so every list query filters it the same way.
 *
 * This is deliberately **not** a Prisma extension like tenant scoping is. The
 * company boundary is absolute and must be impossible to forget, so it's
 * centralized and backed by RLS. A branch restriction is a permission: the
 * owner sees everything, an unassigned employee sees everything, and rows with
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
): Promise<string | null> {
  if (branchId === undefined) return null;
  if (branchId === null || branchId === '') return null;

  const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) throw new NotFoundException(MSG.branch_not_found);

  assertBranchAllowed(allowedBranchIds, branchId);
  return branch.id;
}
