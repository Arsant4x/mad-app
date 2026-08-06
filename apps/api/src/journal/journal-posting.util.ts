import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveCurrency, toBaseAmount } from '../common/currency/base-amount.util';
import { MSG } from '../common/i18n/messages';
import { assertPeriodOpen } from '../fiscal/period-lock.util';

/** Account types whose balance increases with a debit (asset, expense);
 * the rest (liability, equity, revenue) increase with a credit. Matches
 * `DEBIT_NORMAL_TYPES` from the original mockup's ledger logic exactly. */
export const DEBIT_NORMAL_TYPES = new Set(['asset', 'expense']);

export interface PostingLine {
  accountId: string;
  debit: number;
  credit: number;
}

/** Resolves each account id to its type in one query, scoped by the tenant
 * context already baked into `tx`. Throws if any id doesn't resolve — which
 * covers both a genuinely missing account and (just as importantly) another
 * company's account id smuggled into a line: under RLS/the tenant-scope
 * extension that row simply isn't visible here, so it must surface as a
 * clean 404 up front, before any write is attempted, rather than letting a
 * cross-tenant-linked row get created and then fail confusingly later. */
async function fetchAccountTypes(tx: Prisma.TransactionClient, accountIds: string[]): Promise<Map<string, string>> {
  const rows = await tx.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, type: true } });
  const types = new Map(rows.map((r) => [r.id, r.type]));
  if (accountIds.some((id) => !types.has(id))) {
    throw new NotFoundException(MSG.journal_line_account_not_found);
  }
  return types;
}

/** Moves each line's debit/credit into its account's running `balance`,
 * signed by the account's normal side. `sign` is `1` to post, `-1` to
 * reverse (used when a journal entry is deleted). Must run inside the same
 * transaction as the entry create/delete it belongs to, using a tenant-scoped
 * `tx` from `TenantPrismaService.runInTenantContext` — never a raw client. */
export async function applyLinesToBalances(
  tx: Prisma.TransactionClient,
  lines: PostingLine[],
  sign: 1 | -1,
  accountTypes?: Map<string, string>,
): Promise<void> {
  const types = accountTypes ?? (await fetchAccountTypes(tx, [...new Set(lines.map((l) => l.accountId))]));
  for (const line of lines) {
    const delta = DEBIT_NORMAL_TYPES.has(types.get(line.accountId)!) ? line.debit - line.credit : line.credit - line.debit;
    await tx.account.update({
      where: { id: line.accountId },
      data: { balance: { increment: sign * delta } },
    });
  }
}

/** `JE-<year>-<seq>`, same max-based scheme as invoice/purchase numbering —
 * see InvoicesService.nextInvoiceNumber for why count() would be wrong here. */
async function nextJournalNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `JE-${year}-`;
  const rows = await tx.journalEntry.findMany({ where: { no: { startsWith: prefix } }, select: { no: true } });
  const maxSeq = rows.reduce((max, r) => {
    const n = parseInt(r.no.slice(prefix.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

export interface CreateJournalEntryInput {
  companyId: string;
  date: Date;
  memo: string;
  lines: PostingLine[];
  auto?: boolean;
  /** Defaults to the base currency at parity — see base-amount.util. */
  currency?: string;
  exchangeRate?: number;
  branchId?: string | null;
}

/** Creates a balanced journal entry and immediately posts it to account
 * balances — journal entries are always posted on creation in this system
 * (there's no separate draft/unposted state), matching the mockup where
 * `postJournalEntry`/`postInvoiceToLedger`/`postPurchaseToLedger` all create
 * and apply in the same step. Once created, an entry is never edited — only
 * deleted (via `reverseAndDeleteJournalEntry`) and re-created, which avoids
 * balance-drift bugs from partial edits. */
export async function createJournalEntry(
  tx: Prisma.TransactionClient,
  input: CreateJournalEntryInput,
) {
  const totalDebit = input.lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = input.lines.reduce((sum, l) => sum + l.credit, 0);
  if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new BadRequestException(MSG.journal_entry_unbalanced);
  }

  // Refuse anything dated inside a closed period. Placed here rather than in
  // each caller because this function is the one path every posting takes —
  // manual, invoice, purchase and rent alike (see assertPeriodOpen).
  await assertPeriodOpen(tx, input.date);

  // Validate every referenced account belongs to this tenant *before*
  // writing anything — see fetchAccountTypes for why this must come first.
  const accountTypes = await fetchAccountTypes(tx, [...new Set(input.lines.map((l) => l.accountId))]);

  const { currency, exchangeRate } = resolveCurrency(input);
  const no = await nextJournalNumber(tx);
  const entry = await tx.journalEntry.create({
    data: {
      companyId: input.companyId,
      no,
      date: input.date,
      memo: input.memo,
      totalDebit,
      totalCredit,
      auto: input.auto ?? false,
      branchId: input.branchId ?? null,
      currency,
      exchangeRate,
      baseTotalDebit: toBaseAmount(totalDebit, exchangeRate),
      baseTotalCredit: toBaseAmount(totalCredit, exchangeRate),
      lines: {
        create: input.lines.map((l) => ({
          companyId: input.companyId,
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
        })),
      },
    } as unknown as Prisma.JournalEntryUncheckedCreateInput,
    include: { lines: { include: { account: true } } },
  });

  await applyLinesToBalances(tx, input.lines, 1, accountTypes);
  return entry;
}

/** Reverses a journal entry's effect on account balances, then deletes it
 * (its lines cascade-delete with it). No-op if the entry doesn't exist. */
export async function reverseAndDeleteJournalEntry(
  tx: Prisma.TransactionClient,
  journalEntryId: string,
): Promise<void> {
  const entry = await tx.journalEntry.findUnique({
    where: { id: journalEntryId },
    include: { lines: true },
  });
  if (!entry) return;

  await applyLinesToBalances(
    tx,
    entry.lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit), credit: Number(l.credit) })),
    -1,
  );
  await tx.journalEntry.delete({ where: { id: journalEntryId } });
}
