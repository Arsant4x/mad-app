/**
 * Test only: writes a row the database guard of a signed invoice or posted journal line refuses, to build a state the
 * product can no longer reach (a stored document damaged on disk, a legacy row from before a column, a fabricated
 * chain). The guard is disabled for the given transaction and enabled again before it ends, so no other session ever
 * sees it off; a failing write aborts the transaction, and the rollback restores the guard as well.
 */
export type GuardedTable = 'invoices' | 'invoice_lines' | 'journal_lines' | 'journal_entries';

const GUARD_OF: Record<GuardedTable, string> = {
  invoices: 'invoices_signed_guard',
  invoice_lines: 'invoice_lines_signed_guard',
  journal_lines: 'journal_lines_posted_guard',
  journal_entries: 'journal_entries_posted_guard',
};

type RawTx = { $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number> };

export async function writePastDbGuard<T>(tx: RawTx, table: GuardedTable, write: () => Promise<T>): Promise<T> {
  await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${GUARD_OF[table]}"`);
  const result = await write();
  await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${GUARD_OF[table]}"`);
  return result;
}
