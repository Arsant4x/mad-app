import { Prisma } from '@mad-app/db';
import { round2 } from '../common/money/rounding';
import { getOrCreateInventoryAccount } from './inventory-accounts.util';
import { createJournalEntry } from './journal-posting.util';
import { getOrCreateOpeningEquityAccount } from './opening-balance.util';

/**
 * ⭐ `٣٠` **قيدُ إعلان الرصيد الافتتاحي للمخزون** (`ق-١١٧٧/②`): مدين `1300` بقيمة الإعلان / دائن `3900`
 * «الأرصدة الافتتاحية» — **حسابُ `3.8` نفسُه** (حسابُ افتتاحٍ واحد للمنشأة تجتمع فيه أرصدتُها الافتتاحية
 * كلُّها، فالميزانُ يتوازن بالبناء)، بتاريخ الافتتاح، `auto`، ويمرّ من `createJournalEntry` **فيخضع لقفل
 * الفترات** (`assertPeriodOpen`) كما تخضع قيودُ افتتاح الحسابات — شرطٌ لا تفصيل (`ق-١١٧٧/④`).
 *
 * والحسابان يُنشآن عند أوّل حاجة (نمطُ `3900` و`1300` القائم) فلا منشأةَ قائمةً تسكت.
 */
export async function postStockOpeningEntry(
  tx: Prisma.TransactionClient,
  companyId: string,
  o: { no: string; openingDate: Date; baseAmount: number; branchId?: string | null },
) {
  const amount = round2(o.baseAmount);
  if (amount <= 0) return null;
  const equity = await getOrCreateOpeningEquityAccount(tx, companyId);
  return createJournalEntry(tx, {
    companyId,
    date: o.openingDate,
    memo: `رصيدٌ افتتاحيّ — مخزون ${o.no}`,
    lines: [
      { accountId: await getOrCreateInventoryAccount(tx, companyId), debit: amount, credit: 0 },
      { accountId: equity.id, debit: 0, credit: amount },
    ],
    auto: true,
    branchId: o.branchId ?? null,
  });
}

/**
 * عكسُ نصيب سطرٍ من قيد الإعلان عند إلغائه (`ق-١١٧٩`): مدين `3900` / دائن `1300` بقيمة السطر — قيدٌ
 * مسجَّل لا حذفٌ للأصل، بتاريخ الإلغاء (لا بتاريخ الافتتاح: فالفترةُ التي أُعلن فيها قد تكون أُقفلت، والإلغاءُ
 * حدثُ اليوم)، ويخضع للقفل كذلك.
 */
export async function postStockOpeningVoidEntry(
  tx: Prisma.TransactionClient,
  companyId: string,
  v: { no: string; date: Date; baseAmount: number; branchId?: string | null },
) {
  const amount = round2(v.baseAmount);
  if (amount <= 0) return null;
  const equity = await getOrCreateOpeningEquityAccount(tx, companyId);
  return createJournalEntry(tx, {
    companyId,
    date: v.date,
    memo: `إلغاءُ سطرٍ من الرصيد الافتتاحيّ — مخزون ${v.no}`,
    lines: [
      { accountId: equity.id, debit: amount, credit: 0 },
      { accountId: await getOrCreateInventoryAccount(tx, companyId), debit: 0, credit: amount },
    ],
    auto: true,
    branchId: v.branchId ?? null,
  });
}
