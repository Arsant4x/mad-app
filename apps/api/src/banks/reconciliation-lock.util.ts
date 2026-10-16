import { Prisma } from '@mad-app/db';
import { dayEndOf, dayStartOf } from '../common/wall-clock.util';

export interface ReconciledBank {
  id: string;
  name: string;
  reconciledUntil: Date | null;
}

/**
 * Reads the reconciled-through date of the given banks (by id or by ledger account) and holds FOR KEY SHARE on each
 * bank row until the transaction ends. A reconciliation close takes FOR UPDATE on the same row, so the close waits for
 * this transaction, and this read waits for a close in progress and then sees the date it committed.
 *
 * KEY SHARE rather than SHARE: a posting goes on to update the same bank row (its mirror balance), and two postings
 * each holding SHARE on one bank would deadlock when both try to update it; KEY SHARE does not block that update.
 */
export async function lockReconciledBanks(
  tx: Prisma.TransactionClient,
  companyId: string,
  by: { bankIds?: string[]; accountIds?: string[] },
): Promise<ReconciledBank[]> {
  const bankIds = by.bankIds ?? [];
  const accountIds = by.accountIds ?? [];
  if (bankIds.length === 0 && accountIds.length === 0) return [];
  return tx.$queryRaw<ReconciledBank[]>`
    SELECT "id", "name", "reconciledUntil" FROM "banks"
    WHERE "companyId" = ${companyId} AND ("id" = ANY(${bankIds}::text[]) OR "accountId" = ANY(${accountIds}::text[]))
    ORDER BY "id"
    FOR KEY SHARE`;
}

/** The close side: FOR UPDATE on the bank row, so it waits for every transaction holding the shared lock above. */
export async function lockBankForReconciliationClose(tx: Prisma.TransactionClient, companyId: string, bankId: string): Promise<Date | null> {
  const [row] = await tx.$queryRaw<{ reconciledUntil: Date | null }[]>`
    SELECT "reconciledUntil" FROM "banks" WHERE "companyId" = ${companyId} AND "id" = ${bankId} FOR UPDATE`;
  return row?.reconciledUntil ?? null;
}

/** Whether a dated line falls on or before a reconciled-through date (same day rule as matching and unmatching). */
export function onOrBeforeReconciled(reconciledUntil: Date | null, date: Date): boolean {
  return reconciledUntil !== null && dayStartOf(date) <= dayEndOf(reconciledUntil);
}
