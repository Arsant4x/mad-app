import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton } from '../../test/rowMenu';
import { PaymentsPage } from './PaymentsPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/payments', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listPayments: vi.fn() }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

import { listPayments } from '../../api/payments';

beforeEach(() => {
  resetGrants('payments:view');
  vi.mocked(listPayments).mockResolvedValue([
    { id: 'p1', no: 'RCV-1', date: '2026-06-01', customer: { id: 'c1', name: 'Buyer' }, amount: '100.00', allocatedTotal: '100.00', unallocated: '0.00', allocations: [], reversesId: null, prepaymentInvoice: null, reference: null },
  ] as never);
});

/** A receipt voucher and its reversal both need record on payments. */
describe('Receipt voucher controls follow record', () => {
  it('a view only employee gets no new voucher and no reversal', async () => {
    render(<PaymentsPage />);
    await screen.findByText('RCV-1');
    expect(hasButton(i18n.t('payments.page.add'))).toBe(false);
    expect(hasButton(i18n.t('payments.page.reverse'))).toBe(false);
  });

  it('record shows both', async () => {
    grants.add('payments:record');
    render(<PaymentsPage />);
    await screen.findByText('RCV-1');
    expect(hasButton(i18n.t('payments.page.add'))).toBe(true);
    expect(hasButton(i18n.t('payments.page.reverse'))).toBe(true);
  });
});
