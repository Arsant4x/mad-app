import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { assertBranchAllowed, assertBranchIdsOpen } from '../branches/branch-scope.util';
import { formatMessage, MSG } from '../common/i18n/messages';

type Tx = Prisma.TransactionClient;

/**
 * **الفروعُ للمنشأة — ومن فروع المُسنِد** (`ق-٥١٤`): معرّفُ فرعٍ من غير المنشأة يوسّع رؤيةَ الحساب صامتاً، وفرعٌ لا يملكه
 * المُسنِدُ يمنح صلاحيةً دائمةً عليه. **ومصدرٌ واحد** لمسارَي تغيير فروع الحساب: تعديلُه ونقلُ موظّفه المربوط (`ق-١٤٤٥`).
 */
export async function assertBranchIdsAssignable(tx: Tx, allowedBranchIds: string[] | 'all', branchIds: string[]): Promise<void> {
  if (branchIds.length === 0) return;
  const valid = await tx.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true } });
  if (valid.length !== branchIds.length) throw new NotFoundException(MSG.branch_not_found);
  for (const id of branchIds) assertBranchAllowed(allowedBranchIds, id);
  // ⚖️ `ق-١٤٥٣`: والمغلقُ لا يُسنَد إليه حساب — فالإغلاقُ يشترط ألّا حسابَ مُسنَدٌ إليه؛ وفي المصدر الواحد فيشمل نقلَ الموظّف المربوط.
  await assertBranchIdsOpen(tx, branchIds);
}

/**
 * ⚖️ **الإغلاقُ قبل النقل** (`ق-١٤٤٦` — بنصّ المالك: «**وهو حكمُ الصندوق نفسُه**»): حسابٌ على مناوبةِ كاشيرٍ مفتوحة **لا يُخرَج
 * من فرعها حتى تُقفل** — فنقدُ درجها يبقى في فرعٍ لم يعد صاحبُه يراه، ولا يُقفلها إلا المالك. والرفضُ يسمّي المناوبةَ بفرعها
 * ويدلّ على الإقفال. **والفارغُ «بلا قيد»** فلا يُخرَج الحسابُ من فرعٍ، **وإضافةُ فرعٍ مع فرع المناوبة جائزة**: المنعُ للإخراج لا لكلِّ تعديل.
 *
 * **على مستوى المنشأة بحقّها**: المناوبةُ تُبحث بهويّة من فتحها لا بفروع الفاعل — فالمنعُ لحال الحساب، لا لرؤية من ينقله.
 */
export async function assertNoOpenShiftOutside(tx: Tx, companyUserId: string, branchIds: string[]): Promise<void> {
  if (branchIds.length === 0) return;
  const open = await tx.posShift.findFirst({
    where: { openedById: companyUserId, status: 'OPEN', branchId: { not: null, notIn: branchIds } },
    select: { branch: { select: { name: true } } },
  });
  if (open) throw new ConflictException(formatMessage(MSG.company_user_open_shift_blocks_move, { branch: open.branch?.name ?? '' }));
}

/** استبدالٌ كامل: الجسمُ هو المجموعةُ المرادة كلُّها — **والفارغُ لا فرع** (`ق-١٤٦٨`)؛ و«الكلّ» علَمُ `CompanyUser.allBranches`. */
export async function replaceBranchAssignments(tx: Tx, companyUserId: string, branchIds: string[]): Promise<void> {
  await tx.companyUserBranch.deleteMany({ where: { companyUserId } });
  if (branchIds.length > 0) {
    await tx.companyUserBranch.createMany({ data: branchIds.map((branchId) => ({ companyUserId, branchId })) });
  }
}
