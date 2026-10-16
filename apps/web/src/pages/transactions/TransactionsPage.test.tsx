import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BankTx } from '../../api/transactions';
import i18n from '../../i18n';

vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/transactions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/transactions')>()),
  listTransactions: vi.fn(),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));
vi.mock('../../api/banks', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../api/banks')>()), listBanks: vi.fn() }));
vi.mock('../../api/branches', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../api/branches')>()), listBranches: vi.fn() }));

const { listTransactions, deleteTransaction } = await import('../../api/transactions');
const { listBanks } = await import('../../api/banks');
const { listBranches } = await import('../../api/branches');
const { TransactionsPage } = await import('./TransactionsPage');

const row = { id: 't1', branchId: null, bankId: 'b1', bank: { id: 'b1', name: 'Main bank' }, date: '2026-06-12', description: 'Customer deposit', amount: '500', source: null, matched: true, entryNo: null } as unknown as BankTx;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listTransactions).mockResolvedValue({ items: [row], total: 1, page: 1, pageSize: 25 });
  vi.mocked(listBanks).mockResolvedValue([row.bank]);
  vi.mocked(listBranches).mockResolvedValue([]);
});

describe('Bank transactions page', () => {
  it('shows the server message when a delete is refused, and keeps the row', async () => {
    const message = 'This bank transaction is matched in the bank reconciliation; unmatch it first';
    vi.mocked(deleteTransaction).mockRejectedValue({ response: { status: 409, data: { statusCode: 409, message } } });

    render(<TransactionsPage />);
    await waitFor(() => expect(screen.getByText('Customer deposit')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle(i18n.t('common.row_menu.options')));
    fireEvent.click(screen.getByText(i18n.t('transactions.page.delete')));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('transactions.page.delete_confirm') }));

    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument());
    expect(deleteTransaction).toHaveBeenCalledWith('t1');
    expect(listTransactions).toHaveBeenCalledTimes(1);
  });
});
