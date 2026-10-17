import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton, rowMenuLabels } from '../../test/rowMenu';
import { TransactionsPage } from './TransactionsPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/transactions', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listTransactions: vi.fn() }));
vi.mock('../../api/banks', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listBanks: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../api/branches', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listBranches: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

import { listTransactions } from '../../api/transactions';

beforeEach(() => {
  resetGrants('transactions:view');
  vi.mocked(listTransactions).mockResolvedValue({
    items: [{ id: 't1', date: '2026-06-01', description: 'Fee', amount: '-10.00', bank: { id: 'b1', name: 'Bank' }, matched: false, entryNo: null, source: null }],
    total: 1,
    page: 1,
    pageSize: 25,
  } as never);
});

/** A new line records, a change edits, a removal deletes. */
describe('Bank transaction controls follow the actions', () => {
  it('a view only employee gets no add button and no row actions', async () => {
    render(<TransactionsPage />);
    await screen.findByText('Fee');
    expect(hasButton(i18n.t('transactions.page.add'))).toBe(false);
    expect(rowMenuLabels()).toEqual([]);
  });

  it('each action shows its own control', async () => {
    grants.add('transactions:record').add('transactions:edit').add('transactions:delete');
    render(<TransactionsPage />);
    await screen.findByText('Fee');
    expect(hasButton(i18n.t('transactions.page.add'))).toBe(true);
    expect(rowMenuLabels()).toEqual([i18n.t('transactions.page.edit'), i18n.t('transactions.page.delete')]);
  });
});
