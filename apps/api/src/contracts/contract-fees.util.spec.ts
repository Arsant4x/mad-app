import { ConflictException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { PeriodClosedException } from '../fiscal/period-lock.util';
import { postClaimIssueEntry } from '../journal/auto-posting.util';
import { raiseDueFeesWithinTx } from './contract-fees.util';

jest.mock('../journal/auto-posting.util', () => ({ postClaimIssueEntry: jest.fn() }));

const post = postClaimIssueEntry as jest.MockedFunction<typeof postClaimIssueEntry>;

/** One fee on one contract with one due instalment, and a recorder of the claims written. */
function fakeTx() {
  const claims: unknown[] = [];
  const tx = {
    contractFee: {
      findMany: async () => [
        {
          id: 'fee-1',
          contractId: 'contract-1',
          label: 'parking',
          amount: 50,
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          endedAt: null,
          contract: { id: 'contract-1', no: 'C-1', tenant: 'tenant', unitId: 'unit-1', customerId: 'customer-1', currency: 'SAR', exchangeRate: 1 },
          claims: [],
        },
      ],
    },
    installment: { findMany: async () => [{ id: 'installment-1', dueDate: new Date('2026-08-01T00:00:00Z') }] },
    contractClaim: {
      create: async (args: unknown) => {
        claims.push(args);
        return args;
      },
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, claims };
}

describe('Fee sweep and the period lock', () => {
  const asOf = new Date('2026-08-15T00:00:00Z');

  afterEach(() => post.mockReset());

  it('counts an instalment whose period is closed and writes no claim for it', async () => {
    post.mockRejectedValueOnce(new PeriodClosedException('closed'));
    const { tx, claims } = fakeTx();
    await expect(raiseDueFeesWithinTx(tx, 'company-1', asOf)).resolves.toEqual({ raised: 0, blockedByPeriodLock: 1 });
    expect(claims).toHaveLength(0);
  });

  it('lets a conflict of another kind fail the sweep', async () => {
    post.mockRejectedValueOnce(new ConflictException('no period for this date'));
    const { tx, claims } = fakeTx();
    await expect(raiseDueFeesWithinTx(tx, 'company-1', asOf)).rejects.toThrow('no period for this date');
    expect(claims).toHaveLength(0);
  });

  it('raises the claim when the period is open', async () => {
    post.mockResolvedValueOnce({ id: 'entry-1' } as Awaited<ReturnType<typeof postClaimIssueEntry>>);
    const { tx, claims } = fakeTx();
    await expect(raiseDueFeesWithinTx(tx, 'company-1', asOf)).resolves.toEqual({ raised: 1, blockedByPeriodLock: 0 });
    expect(claims).toHaveLength(1);
  });
});
