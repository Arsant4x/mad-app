import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatMessage, MSG } from '../common/i18n/messages';
import { createJournalEntry, DEBIT_NORMAL_TYPES, PostingLine } from './journal-posting.util';

/**
 * Opening balances as real postings (closes the named 3.8 debt): an account's
 * opening balance is never seeded into `balance` — it is posted as a balanced
 * قيد افتتاحي against the 3900 opening-balances equity account, dated at the
 * start of the fiscal year covering today (or today when no calendar exists),
 * marked `auto` and `openingForAccountId`. Editing the opening balance posts a
 * *delta* entry through the same path — history is never mutated in place —
 * and both paths go through `createJournalEntry`, so numbering, balancing and
 * closed-period refusal (assertPeriodOpen) all apply unchanged.
 *
 * Every query here filters by `companyId` explicitly even though the service
 * path already runs tenant-scoped: these functions are also called from the
 * seed and the backfill script, whose raw Prisma client has no tenant
 * extension — the explicit filter keeps them correct under any client.
 */

export const OPENING_EQUITY_CODE = '3900';
export const OPENING_EQUITY_NAME = 'الأرصدة الافتتاحية';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type AccountForOpening = { id: string; code: string; name: string; type: string };

/** The 3900 counterpart account, created on first use. An existing 3900 with a
 * non-equity type is a chart conflict the user must resolve — refusing beats
 * silently posting equity entries into, say, an expense account. */
export async function getOrCreateOpeningEquityAccount(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<AccountForOpening> {
  const existing = await tx.account.findFirst({ where: { companyId, code: OPENING_EQUITY_CODE } });
  if (existing) {
    if (existing.type !== 'equity') {
      throw new ConflictException(formatMessage(MSG.account_opening_equity_type_conflict, { code: OPENING_EQUITY_CODE }));
    }
    return existing;
  }
  return tx.account.create({
    // Explicit companyId — accepted under the tenant extension (same pattern
    // as createJournalEntry) and required under the seed/script clients.
    data: { companyId, code: OPENING_EQUITY_CODE, name: OPENING_EQUITY_NAME, type: 'equity' } as unknown as Prisma.AccountCreateInput,
  });
}

/** Opening entries carry the fiscal-year-start date so the opening position
 * belongs to the year from its first day — when a calendar covering today
 * exists. Without one there is no year start to anchor to, so today is used
 * (and, as everywhere else, no calendar means no period restriction). */
export async function openingEntryDate(tx: Prisma.TransactionClient, companyId: string): Promise<Date> {
  const now = new Date();
  // Local calendar date at UTC midnight — the same shape a '2026-08-08' DTO
  // string parses to, so @db.Date comparisons behave identically.
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const year = await tx.fiscalYear.findFirst({ where: { companyId, start: { lte: today }, end: { gte: today } } });
  return year ? new Date(year.start) : today;
}

/** The two balanced lines that move `account` by `delta` on its normal side,
 * with 3900 as the counterpart. A negative delta flips the sides instead of
 * producing negative amounts, which the posting layer rightly rejects. */
export function openingDeltaLines(account: { id: string; type: string }, equityAccountId: string, delta: number): PostingLine[] {
  const amount = round2(Math.abs(delta));
  const accountGetsDebit = DEBIT_NORMAL_TYPES.has(account.type) === delta > 0;
  return [
    { accountId: account.id, debit: accountGetsDebit ? amount : 0, credit: accountGetsDebit ? 0 : amount },
    { accountId: equityAccountId, debit: accountGetsDebit ? 0 : amount, credit: accountGetsDebit ? amount : 0 },
  ];
}

export interface OpeningDeltaInput {
  companyId: string;
  account: AccountForOpening;
  /** Signed change to the account's opening balance, on its normal side. */
  delta: number;
  memo?: string;
}

/** Posts the قيد افتتاحي (or a delta entry for an edit). Returns null when the
 * delta rounds to zero — nothing to post. Callers that can race on journal
 * numbering must wrap their transaction in `retryOnUniqueConflict`, exactly
 * like every other posting service. */
export async function postOpeningDeltaEntry(tx: Prisma.TransactionClient, input: OpeningDeltaInput) {
  const delta = round2(input.delta);
  if (delta === 0) return null;

  const equity = await getOrCreateOpeningEquityAccount(tx, input.companyId);
  if (equity.id === input.account.id) {
    // Backstop — the service guards this by code, but the counterpart of an
    // opening entry can never be the account being opened.
    throw new ConflictException(formatMessage(MSG.account_opening_equity_protected, { code: OPENING_EQUITY_CODE }));
  }

  return createJournalEntry(tx, {
    companyId: input.companyId,
    date: await openingEntryDate(tx, input.companyId),
    memo: input.memo ?? `قيد افتتاحي — ${input.account.name} (${input.account.code})`,
    auto: true,
    openingForAccountId: input.account.id,
    lines: openingDeltaLines(input.account, equity.id, delta),
  });
}

/**
 * Backfill for accounts created before opening balances were posted as
 * entries: their opening amount was seeded straight into `balance`, so the
 * ledger is missing the entry but the balance is already right. Posting the
 * entry applies the amount to `balance` a second time — so the account-side
 * increment is reverted right after, leaving: ledger gains the قيد افتتاحي,
 * the account's balance unchanged, and 3900 carrying the counterpart.
 *
 * Idempotent: an account that already has an opening entry is skipped, so
 * running this any number of times adds nothing twice.
 */
export async function backfillCompanyOpeningEntries(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<{ code: string; name: string; amount: number }[]> {
  const accounts = await tx.account.findMany({
    where: {
      companyId,
      openingBalance: { not: 0 },
      openingEntries: { none: {} },
      code: { not: OPENING_EQUITY_CODE },
    },
    orderBy: { code: 'asc' },
  });

  const posted: { code: string; name: string; amount: number }[] = [];
  for (const account of accounts) {
    const delta = round2(Number(account.openingBalance));
    await postOpeningDeltaEntry(tx, { companyId, account, delta });
    await tx.account.update({ where: { id: account.id }, data: { balance: { decrement: delta } } });
    posted.push({ code: account.code, name: account.name, amount: delta });
  }
  return posted;
}
