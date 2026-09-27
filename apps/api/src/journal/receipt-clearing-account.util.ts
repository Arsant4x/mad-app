import { ConflictException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { RECEIPT_CLEARING_BANDS, nextCodeInBands } from '../accounts/code-bands';
import { MSG } from '../common/i18n/messages';

/**
 * ٢٥ **وسيطُ الاستلام** — بضاعةٌ مستلَمة غيرُ مفوترة (`ق-١١٢١` · `ق-١١٣١`).
 *
 * ## لماذا حسابٌ مشتقُّ الرمز لا رمزٌ محجوز كـ`1300`
 * حكمُ المالك: «رمزٌ في `2xxx` مشتقٌّ بـ`MAX+1` كالأدراج والبنوك». فالرمزُ يُقرأ من دليل المنشأة لحظةَ
 * الإنشاء (`nextCodeInBands` — `ق-١٩٨` · `ق-٢٩٥`) لا من ثابت، **وتشير إليه المنشأةُ بالمعرّف**
 * (`Company.receiptClearingAccountId`) — فلا يعود قارئٌ يبحث عنه بالاسم أو بالرمز (`§6.3`).
 *
 * ## متى يُنشأ
 * عند أوّل حاجةٍ داخل معاملة المستأجر — أوّلُ شراءٍ مخزنيّ يُرحَّل أو أوّلُ استلام — كنمط `3900`
 * و`1300`. **ولا يُنشأ للجميع في هجرة**: منشأةٌ بلا مشترياتٍ مخزنية لا تحتاجه.
 *
 * ## التزامن
 * طالبان معاً في منشأةٍ واحدة يقرآن الرمزَ نفسَه؛ الثاني يقف على `(companyId, code)` الفريد فتُجهض
 * معاملتُه — **ومعاملةُ الشراء ملفوفةٌ بإعادة المحاولة** (`retryOnUniqueConflict`) فتُعاد بقراءةٍ جديدة
 * تجد المؤشّرَ مكتوباً. نمطُ الدرج والبنك بعينه.
 */
type Tx = Prisma.TransactionClient;

export const RECEIPT_CLEARING_ACCOUNT_NAME = 'وسيط الاستلام — بضاعة مستلَمة غير مفوترة';

export async function getOrCreateReceiptClearingAccount(tx: Tx, companyId: string): Promise<string> {
  const company = await tx.company.findUnique({ where: { id: companyId }, select: { receiptClearingAccountId: true } });
  if (company?.receiptClearingAccountId) {
    const existing = await tx.account.findUnique({ where: { id: company.receiptClearingAccountId }, select: { id: true, type: true } });
    if (existing) {
      // ⚠️ حسابٌ غُيِّر نوعُه بيدٍ لا يُستعمل ولا يُصحَّح صامتاً — تصنيفُه ملكُ المحاسب.
      if (existing.type !== 'liability') throw new ConflictException(MSG.receipt_clearing_account_type_conflict);
      return existing.id;
    }
  }
  const accounts = await tx.account.findMany({ select: { code: true } });
  const next = nextCodeInBands(accounts.map((a) => a.code), RECEIPT_CLEARING_BANDS);
  if (next === null) throw new ConflictException(MSG.receipt_clearing_code_range_full);
  const created = await tx.account.create({
    // `companyId` صريح — مقبولٌ تحت امتداد المستأجر، ولازمٌ حين يُستدعى من مسارٍ بلا امتداد.
    data: { companyId, code: String(next), name: RECEIPT_CLEARING_ACCOUNT_NAME, type: 'liability' } as unknown as Prisma.AccountCreateInput,
    select: { id: true },
  });
  await tx.company.update({ where: { id: companyId }, data: { receiptClearingAccountId: created.id } });
  return created.id;
}
