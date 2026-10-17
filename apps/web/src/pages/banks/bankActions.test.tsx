import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as banks from '../../api/banks';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton, rowMenuLabels } from '../../test/rowMenu';
import { BanksPage } from './BanksPage';
import { CashDepositsPanel } from './CashDepositsPanel';
import { NetworkSettlementsPanel } from './NetworkSettlementsPanel';
import { ReconciliationPanel } from './ReconciliationPanel';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/banks');
vi.mock('../../api/branches', () => ({ listBranches: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../api/cashDrawers', () => ({ listCashDrawers: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../api/accounts', () => ({ listAccounts: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

const bank: banks.Bank = { archived: false, id: 'b1', branchId: null, kind: 'BANK_ACCOUNT', name: 'Main bank', iban: null, balance: '0.00', openingBalance: '0.00', openingDate: '2026-01-01' };

beforeEach(() => {
  vi.clearAllMocks();
  resetGrants('banks:view');
  vi.mocked(banks.listBanks).mockResolvedValue([bank]);
  vi.mocked(banks.getBankCodeBand).mockResolvedValue({ warn: false } as never);
  vi.mocked(banks.listCashDeposits).mockResolvedValue({
    items: [{ id: 'd1', no: 'CD-1', date: '2026-06-05', amount: '300.00', memo: null, status: 'IN_TRANSIT', drawer: { id: 'dr1', name: 'Drawer' }, bank: { id: 'b1', name: 'Main bank' }, branchId: null, journalEntryId: 'e1', voidJournalEntryId: null, confirmedTransactionId: null, confirmedAt: null }],
    inTransit: { ledger: '300.00', documents: '300.00', matched: true },
  });
  vi.mocked(banks.listNetworkSettlements).mockResolvedValue({
    items: [{ id: 'ns1', no: 'NS-1', date: '2026-07-02', periodFrom: '2026-06-01', periodTo: '2026-06-30', grossAmount: '100.00', feeAmount: '1.00', feeVatAmount: '0.15', netAmount: '98.85', memo: null, status: 'POSTED', branchId: null, bankId: 'b1', bank: { id: 'b1', name: 'Main bank' }, journalEntryId: 'e1', voidJournalEntryId: null, receiptCount: 1 }],
    summary: { ledger: '0.00', open: '0.00', openCount: 0, matched: true },
  });
  vi.mocked(banks.getReconciliation).mockResolvedValue({
    bank: { id: 'b1', name: 'Main bank', accountId: 'a1', reconciledUntil: '2026-05-31', mirrorBalance: '0.00' },
    from: null,
    to: null,
    statement: [
      { id: 's1', date: '2026-06-12', description: 'Deposit', amount: '500.00', matchedLineId: null, matchedAt: null, source: null },
      { id: 's2', date: '2026-06-13', description: 'Matched', amount: '20.00', matchedLineId: 'l2', matchedAt: '2026-06-14', source: null },
    ],
    ledger: { opening: '0.00', closing: '500.00', rows: [], truncated: false },
    suggestions: [{ transactionId: 's1', lineIds: ['l1'] }],
    totals: { unmatchedStatement: '500.00', unmatchedStatementCount: 1, unmatchedLedger: '0.00', unmatchedLedgerCount: 0 },
  } as never);
});

describe('Banks page controls follow the actions', () => {
  it('a view only employee gets no add button and only the reconcile view in the row', async () => {
    render(<BanksPage />);
    await screen.findByText('Main bank');
    expect(hasButton(i18n.t('banks.page.add'))).toBe(false);
    expect(rowMenuLabels()).toEqual([i18n.t('banks.page.reconcile')]);
  });

  it('add shows the add button, edit shows edit and archive, delete shows delete', async () => {
    grants.add('banks:add').add('banks:edit').add('banks:delete');
    render(<BanksPage />);
    await screen.findByText('Main bank');
    expect(hasButton(i18n.t('banks.page.add'))).toBe(true);
    expect(rowMenuLabels()).toEqual([i18n.t('banks.page.edit'), i18n.t('banks.page.reconcile'), i18n.t('banks.page.archive'), i18n.t('banks.page.delete')]);
  });
});

describe('Cash deposits and network settlements need record', () => {
  it('without record the deposits panel only reads: no new deposit form and no void', async () => {
    render(<CashDepositsPanel banks={[bank]} onClose={() => {}} />);
    await screen.findByText('CD-1');
    expect(hasButton(i18n.t('banks.deposits.submit'))).toBe(false);
    expect(hasButton(i18n.t('banks.void_reverse'))).toBe(false);
  });

  it('with record the deposits panel offers the deposit and its void', async () => {
    grants.add('banks:record');
    render(<CashDepositsPanel banks={[bank]} onClose={() => {}} />);
    await screen.findByText('CD-1');
    expect(hasButton(i18n.t('banks.deposits.submit'))).toBe(true);
    expect(hasButton(i18n.t('banks.void_reverse'))).toBe(true);
  });

  it('without record the settlements panel only reads; with record it offers the settlement and its void', async () => {
    const { unmount } = render(<NetworkSettlementsPanel banks={[bank]} onClose={() => {}} />);
    await screen.findByText('NS-1');
    expect(hasButton(i18n.t('banks.settlements.submit'))).toBe(false);
    expect(hasButton(i18n.t('banks.void_reverse'))).toBe(false);
    unmount();
    grants.add('banks:record');
    render(<NetworkSettlementsPanel banks={[bank]} onClose={() => {}} />);
    await screen.findByText('NS-1');
    expect(hasButton(i18n.t('banks.settlements.submit'))).toBe(true);
    expect(hasButton(i18n.t('banks.void_reverse'))).toBe(true);
  });
});

describe('Reconciliation: matching records, closing and reopening review', () => {
  const matchLabel = () => i18n.t('banks.reconciliation.match_with', { line: 'l1' });

  it('a view only employee sees the lines and no action', async () => {
    render(<ReconciliationPanel bank={bank} onClose={() => {}} />);
    await screen.findByText('Deposit');
    expect(hasButton(matchLabel())).toBe(false);
    expect(hasButton(i18n.t('banks.reconciliation.post_with'))).toBe(false);
    expect(hasButton(i18n.t('banks.reconciliation.unmatch'))).toBe(false);
    expect(hasButton(i18n.t('banks.reconciliation.lock'))).toBe(false);
    expect(hasButton(i18n.t('banks.reconciliation.reopen'))).toBe(false);
  });

  it('record offers match, post and unmatch; review offers lock and reopen', async () => {
    grants.add('banks:record');
    const { unmount } = render(<ReconciliationPanel bank={bank} onClose={() => {}} />);
    await screen.findByText('Deposit');
    expect(hasButton(matchLabel())).toBe(true);
    expect(hasButton(i18n.t('banks.reconciliation.post_with'))).toBe(true);
    expect(hasButton(i18n.t('banks.reconciliation.unmatch'))).toBe(true);
    expect(hasButton(i18n.t('banks.reconciliation.lock'))).toBe(false);
    unmount();
    resetGrants('banks:view', 'banks:review');
    render(<ReconciliationPanel bank={bank} onClose={() => {}} />);
    await screen.findByText('Deposit');
    expect(hasButton(i18n.t('banks.reconciliation.lock'))).toBe(true);
    expect(hasButton(i18n.t('banks.reconciliation.reopen'))).toBe(true);
    expect(hasButton(matchLabel())).toBe(false);
  });
});
