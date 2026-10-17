import type { Prisma } from '@mad-app/db';
import { LEDGER_LINE_CAP, readLedger } from './ledger.util';

/** A range of `n` lines, each debit 1.00, all inside the requested period. */
function fakeTx(n: number, opening: { debit: number; credit: number }) {
  const all = Array.from({ length: n }, (_, i) => ({
    id: `l${String(i).padStart(6, '0')}`,
    journalEntryId: `e${i}`,
    accountId: 'acc',
    debit: '1.00',
    credit: '0.00',
    customerId: null,
    supplierId: null,
    propertyId: null,
    unitId: null,
    account: { code: '1000', name: 'Cash' },
    journalEntry: { id: `e${i}`, no: `JE-${i}`, date: new Date('2026-05-10'), memo: '', branchId: null, auto: false, openingForAccountId: null, reversalOf: null },
  }));
  const calls: { findManyWhere?: unknown; aggregateWheres: unknown[] } = { aggregateWheres: [] };
  const tx = {
    journalLine: {
      count: jest.fn(async () => all.length),
      findMany: jest.fn(async (args: { where: unknown; take?: number }) => {
        calls.findManyWhere = args.where;
        return all.slice(0, args.take ?? all.length);
      }),
      aggregate: jest.fn(async (args: { where: { journalEntry?: { date?: { lt?: Date } } } }) => {
        calls.aggregateWheres.push(args.where);
        if (args.where.journalEntry?.date?.lt) return { _sum: { debit: opening.debit, credit: opening.credit } };
        return { _sum: { debit: all.length, credit: 0 } };
      }),
    },
    $queryRawUnsafe: jest.fn(async () => []),
  };
  return { tx: tx as unknown as Prisma.TransactionClient, calls };
}

describe('readLedger totals over a range larger than the line cap', () => {
  const filter = { allowedBranchIds: 'all' as const, accountId: 'acc', from: new Date('2026-05-01'), to: new Date('2026-05-31') };

  it('computes closing and totals from the whole range while the rows stay capped', async () => {
    const n = LEDGER_LINE_CAP + 3;
    const { tx, calls } = fakeTx(n, { debit: 100, credit: 0 });
    const r = await readLedger(tx, filter, 'debit');

    expect(r.truncated).toBe(true);
    expect(r.count).toBe(n);
    expect(r.rows).toHaveLength(LEDGER_LINE_CAP);
    expect(r.opening).toBe('100.00');
    expect(r.closing).toBe(`${100 + n}.00`);
    expect(r.totalDebit).toBe(`${n}.00`);
    expect(r.totalCredit).toBe('0.00');
    // The totals come from the same filter as the rows, not a wider one.
    expect(calls.aggregateWheres).toContainEqual(calls.findManyWhere);
  });

  it('keeps the closing equal to the last running balance when nothing is cut', async () => {
    const { tx } = fakeTx(4, { debit: 10, credit: 0 });
    const r = await readLedger(tx, filter, 'debit');

    expect(r.truncated).toBe(false);
    expect(r.rows).toHaveLength(4);
    expect(r.closing).toBe('14.00');
    expect(r.rows[r.rows.length - 1].balance).toBe(r.closing);
  });
});
