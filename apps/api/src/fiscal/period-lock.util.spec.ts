import { ConflictException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { assertPeriodOpen, PeriodClosedException } from './period-lock.util';

jest.mock('./fiscal-calendar.util', () => ({ ensureFiscalYearFor: jest.fn(async () => undefined) }));

/** A transaction that finds one period with the given status, or none. */
function txWithPeriod(status: 'OPEN' | 'CLOSED' | null): Prisma.TransactionClient {
  return {
    fiscalPeriod: { findFirst: async () => (status ? { id: 'period-1' } : null) },
    $queryRaw: async () => (status ? [{ status }] : []),
  } as unknown as Prisma.TransactionClient;
}

describe('Period lock refusals', () => {
  const date = new Date('2026-08-15T00:00:00Z');

  it('refuses a closed period with its own conflict, so the sweeps can count it', async () => {
    const refusal = await assertPeriodOpen(txWithPeriod('CLOSED'), date).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(PeriodClosedException);
    expect(refusal).toBeInstanceOf(ConflictException);
    expect((refusal as ConflictException).getStatus()).toBe(409);
  });

  it('refuses a date with no period by a conflict the sweeps do not count', async () => {
    const refusal = await assertPeriodOpen(txWithPeriod(null), date).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(ConflictException);
    expect(refusal).not.toBeInstanceOf(PeriodClosedException);
  });

  it('lets an open period through', async () => {
    await expect(assertPeriodOpen(txWithPeriod('OPEN'), date)).resolves.toBeUndefined();
  });
});
