import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CashDepositsPanel } from './CashDepositsPanel';
import * as banks from '../../api/banks';
import { listCashDrawers } from '../../api/cashDrawers';

vi.mock('../../api/banks');
vi.mock('../../api/cashDrawers', () => ({ listCashDrawers: vi.fn() }));

const bankRows: banks.Bank[] = [
  { archived: false, id: 'b1', branchId: null, name: 'بنك الإيداع', iban: null, balance: '0.00', openingBalance: '0.00', openingDate: '2026-01-01' },
  { archived: true, id: 'b9', branchId: null, name: 'بنك مؤرشف', iban: null, balance: '0.00', openingBalance: '0.00', openingDate: '2026-01-01' },
];

const deposit = (over: Partial<banks.CashDeposit> = {}): banks.CashDeposit => ({
  id: 'd1',
  no: 'CD-2026-0001',
  date: '2026-06-05',
  amount: '300.00',
  memo: null,
  status: 'IN_TRANSIT',
  drawer: { id: 'dr1', name: 'درج الصالة' },
  bank: { id: 'b1', name: 'بنك الإيداع' },
  branchId: null,
  journalEntryId: 'e1',
  voidJournalEntryId: null,
  confirmedTransactionId: null,
  confirmedAt: null,
  ...over,
});

/** إيداعاتُ الأدراج (⑦A3) — الشاشةُ تقرأ رصيدَ الطريق ومطابقتَه من الخادم وترسل الإيداعَ بمعرّفَي الدرج والبنك. */
describe('لوحةُ إيداعات الأدراج', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCashDrawers).mockResolvedValue([
      { id: 'dr1', name: 'درج الصالة', isActive: true, isDefault: true, branchId: null, branch: null, account: { id: 'a1', code: '1010', name: 'درج الصالة', balance: '500.00' } },
    ]);
    vi.mocked(banks.listCashDeposits).mockResolvedValue({ items: [deposit()], inTransit: { ledger: '300.00', documents: '300.00', matched: true } });
    vi.mocked(banks.createCashDeposit).mockResolvedValue({ ...deposit({ id: 'd2', no: 'CD-2026-0002', amount: '120.00' }), entryNo: 'JE-2026-0009' });
    vi.mocked(banks.voidCashDeposit).mockResolvedValue({ ...deposit({ status: 'VOID' }), voidEntryNo: 'JE-2026-0010' });
  });

  it('تعرض رصيدَ الطريق ومجموعَ المستندات كما جاءا، وترسل الإيداعَ الجديد بالدرج والبنك والمبلغ', async () => {
    render(<CashDepositsPanel banks={bankRows} onClose={() => {}} />);
    expect(await screen.findByText('CD-2026-0001')).toBeInTheDocument();
    expect(screen.getByTestId('in-transit-ledger')).toHaveTextContent('300.00');
    expect(screen.getByText('الدفترُ والمستنداتُ متطابقان')).toBeInTheDocument();
    // البنكُ المؤرشف لا يُعرض في الاختيار.
    expect(screen.queryByRole('option', { name: 'بنك مؤرشف' })).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText('الدرج'), 'dr1');
    await userEvent.selectOptions(screen.getByLabelText('البنك'), 'b1');
    // حقلا التاريخ والمبلغ بحدثِ تغييرٍ واحد — الكتابةُ حرفاً حرفاً في حقل تاريخٍ تكلّف ثوانيَ على جهازٍ مثقَل
    // وتُسقط الاختبارَ على المهلة لا على المنطق (قِيس: 2.9 s خالياً · 6 s مثقَلاً).
    fireEvent.change(screen.getByLabelText('التاريخ'), { target: { value: '2026-06-09' } });
    fireEvent.change(screen.getByLabelText('المبلغ'), { target: { value: '120' } });
    await userEvent.click(screen.getByText('أودِع'));
    expect(vi.mocked(banks.createCashDeposit)).toHaveBeenCalledWith({ drawerId: 'dr1', bankId: 'b1', amount: 120, date: '2026-06-09', memo: undefined });
    expect(await screen.findByTestId('deposit-notice')).toHaveTextContent('CD-2026-0002');
    expect(screen.getByTestId('deposit-notice')).toHaveTextContent('JE-2026-0009');
  }, 15000);

  it('الإلغاءُ عكسٌ للمفتوح وحدَه، والفرقُ بين الدفتر والمستندات يُعلَن كما قاله الخادم', async () => {
    vi.mocked(banks.listCashDeposits).mockResolvedValue({
      items: [deposit(), deposit({ id: 'd3', no: 'CD-2026-0003', status: 'CONFIRMED', confirmedTransactionId: 't1' })],
      inTransit: { ledger: '450.00', documents: '300.00', matched: false },
    });
    render(<CashDepositsPanel banks={bankRows} onClose={() => {}} />);
    await screen.findByText('CD-2026-0003');
    expect(screen.getByTestId('in-transit-gap')).toBeInTheDocument();
    // زرُّ الإلغاء على المفتوح وحدَه — المؤكَّدُ لا يُلغى.
    expect(screen.getAllByText('↩ ألغِ (عكس)')).toHaveLength(1);
    await userEvent.click(screen.getByText('↩ ألغِ (عكس)'));
    expect(vi.mocked(banks.voidCashDeposit)).toHaveBeenCalledWith('d1');
    expect(await screen.findByTestId('deposit-notice')).toHaveTextContent('JE-2026-0010');
  });
});
