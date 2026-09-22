import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReconciliationPanel } from './ReconciliationPanel';
import * as banks from '../../api/banks';
import { listAccounts } from '../../api/accounts';

vi.mock('../../api/banks');
vi.mock('../../api/accounts', () => ({ listAccounts: vi.fn() }));

const bank: banks.Bank = { archived: false, id: 'b1', branchId: null, name: 'بنك التسوية', iban: null, balance: '465.00', openingBalance: '0.00', openingDate: '2026-01-01' };

const overview = (over: Partial<banks.ReconciliationOverview> = {}): banks.ReconciliationOverview => ({
  bank: { id: 'b1', name: 'بنك التسوية', accountId: 'a1', reconciledUntil: null, mirrorBalance: '465.00' },
  from: null,
  to: null,
  statement: [
    { id: 's1', date: '2026-06-12', description: 'إيداع عميل', amount: '500.00', matchedLineId: null, matchedAt: null, source: null },
    { id: 's2', date: '2026-06-15', description: 'رسوم البنك', amount: '-35.00', matchedLineId: null, matchedAt: null, source: null },
  ],
  ledger: {
    opening: '0.00',
    closing: '500.00',
    rows: [{ lineId: 'l1', entryId: 'e1', entryNo: 'JE-2026-0001', date: '2026-06-10', memo: 'قبض', debit: '500.00', credit: '0.00', balance: '500.00', source: { type: 'PAYMENT', id: 'p1', no: 'RCV-2026-0001' }, matched: false }],
    truncated: false,
  },
  suggestions: [
    { transactionId: 's1', lineIds: ['l1'] },
    { transactionId: 's2', lineIds: [] },
  ],
  totals: { unmatchedStatement: '465.00', unmatchedStatementCount: 2, unmatchedLedger: '500.00', unmatchedLedgerCount: 1 },
  ...over,
});

/** التسويةُ البنكية — الشاشةُ تقرأ المجاميعَ والمقترَحاتِ من الخادم وتُرسل الأفعالَ بمعرّفاتها. */
describe('لوحةُ التسوية البنكية', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAccounts).mockResolvedValue([{ id: 'a5300', code: '5300', name: 'مصروفات إدارية', type: 'expense' } as never]);
    vi.mocked(banks.getReconciliation).mockResolvedValue(overview());
    vi.mocked(banks.listCashDeposits).mockResolvedValue({ items: [], inTransit: { ledger: '0.00', documents: '0.00', matched: true } });
    vi.mocked(banks.matchStatementLine).mockResolvedValue({});
    vi.mocked(banks.postStatementLine).mockResolvedValue({});
    vi.mocked(banks.confirmDepositFromStatement).mockResolvedValue({});
  });

  it('تعرض الجانبين والمجاميعَ كما جاءت، وتقترح المطابقةَ من الخادم وترسلها بمعرّفَي السطرين', async () => {
    render(<ReconciliationPanel bank={bank} onClose={() => {}} />);
    expect(await screen.findByText('إيداع عميل')).toBeInTheDocument();
    expect(screen.getAllByTestId('statement-row')).toHaveLength(2);
    expect(screen.getByText(/المعلَّق: 2/)).toHaveTextContent('465.00');
    await userEvent.click(screen.getByText(/✓ طابِق بـ/));
    expect(vi.mocked(banks.matchStatementLine)).toHaveBeenCalledWith('b1', 's1', 'l1');
  });

  it('السطرُ بلا دفتر يُرحَّل بطرفٍ يختاره المستخدم — لا يُخترع', async () => {
    render(<ReconciliationPanel bank={bank} onClose={() => {}} />);
    await screen.findByText('رسوم البنك');
    await userEvent.click(screen.getAllByText('↳ رحِّل بطرف')[1]);
    await userEvent.selectOptions(await screen.findByLabelText('الطرف المقابل'), 'a5300');
    await userEvent.click(screen.getByText('رحِّل وطابِق'));
    expect(vi.mocked(banks.postStatementLine)).toHaveBeenCalledWith('b1', 's2', 'a5300', 'رسوم البنك');
  });

  it('إيداعُ درجٍ في الطريق يُؤكَّد من سطر الكشف بمعرّف المستند — بلا طرفٍ يُختار، فالخادم يفرض 1190', async () => {
    vi.mocked(banks.listCashDeposits).mockResolvedValue({
      items: [
        { id: 'd1', no: 'CD-2026-0001', date: '2026-06-05', amount: '500.00', memo: null, status: 'IN_TRANSIT', drawer: { id: 'dr1', name: 'درج الصالة' }, bank: { id: 'b1', name: 'بنك التسوية' }, branchId: null, journalEntryId: 'e9', voidJournalEntryId: null, confirmedTransactionId: null, confirmedAt: null },
      ],
      inTransit: { ledger: '500.00', documents: '500.00', matched: true },
    });
    render(<ReconciliationPanel bank={bank} onClose={() => {}} />);
    await screen.findByText('إيداع عميل');
    await userEvent.click(screen.getAllByText('↳ رحِّل بطرف')[0]);
    await userEvent.selectOptions(await screen.findByLabelText('إيداعُ درجٍ في الطريق'), 'd1');
    // اختيارُ الإيداع يُخفي اختيارَ الطرف — لا طرفَ يُرسَل.
    expect(screen.queryByLabelText('الطرف المقابل')).toBeNull();
    await userEvent.click(screen.getByText('أكِّد الإيداع وطابِق'));
    expect(vi.mocked(banks.confirmDepositFromStatement)).toHaveBeenCalledWith('b1', 's1', 'd1');
    expect(vi.mocked(banks.postStatementLine)).not.toHaveBeenCalled();
  });
});
