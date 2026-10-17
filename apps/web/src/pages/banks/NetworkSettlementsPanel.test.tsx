import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkSettlementsPanel } from './NetworkSettlementsPanel';
import * as banks from '../../api/banks';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (14.2 ث).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 43_000 });

vi.mock('../../api/banks');
// Every action held: this file measures the panel, not the grant.
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).allGrantedModule());

const bankRows: banks.Bank[] = [{ archived: false, id: 'b1', branchId: null, kind: 'BANK_ACCOUNT', name: 'بنك الشبكة', iban: null, balance: '0.00', openingBalance: '0.00', openingDate: '2026-01-01' }];

const settlement = (over: Partial<banks.NetworkSettlement> = {}): banks.NetworkSettlement => ({
  id: 'ns1',
  no: 'NS-2026-0001',
  date: '2026-07-02',
  periodFrom: '2026-06-01',
  periodTo: '2026-06-30',
  grossAmount: '1500.00',
  feeAmount: '30.00',
  feeVatAmount: '4.50',
  netAmount: '1465.50',
  memo: null,
  status: 'POSTED',
  branchId: null,
  bankId: 'b1',
  bank: { id: 'b1', name: 'بنك الشبكة' },
  journalEntryId: 'e1',
  voidJournalEntryId: null,
  receiptCount: 2,
  ...over,
});

/** تسويةُ الشبكة (⑦A2) — الشاشةُ تقرأ الإجماليَّ والمفتوحَ من الخادم وترسل العمولةَ وضريبتَها كما أُدخلتا. */
describe('لوحةُ تسويات الشبكة', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(banks.listNetworkSettlements).mockResolvedValue({ items: [settlement()], summary: { ledger: '100.00', open: '100.00', openCount: 1, matched: true } });
    vi.mocked(banks.getOpenNetworkReceipts).mockResolvedValue({
      receipts: [{ id: 'p3', no: 'RCV-2026-0003', date: '2026-07-01', branchId: null, customerName: 'عميل', signed: '100.00' }],
      gross: '100.00',
      summary: { ledger: '100.00', open: '100.00', openCount: 1, matched: true },
    });
    vi.mocked(banks.createNetworkSettlement).mockResolvedValue({ ...settlement({ id: 'ns2', no: 'NS-2026-0002', grossAmount: '100.00', feeAmount: '2.00', feeVatAmount: '0.30', netAmount: '97.70', receiptCount: 1 }), entryNo: 'JE-2026-0020' });
    vi.mocked(banks.voidNetworkSettlement).mockResolvedValue({ ...settlement({ status: 'VOID' }), voidEntryNo: 'JE-2026-0021' });
  });

  it('تعرض رصيدَ 1251 والمفتوحَ كما جاءا، وتقرأ إجماليَّ المدى من الخادم، وترسل التسوية بالعمولة وضريبتها', async () => {
    render(<NetworkSettlementsPanel banks={bankRows} onClose={() => {}} />);
    expect(await screen.findByText('NS-2026-0001')).toBeInTheDocument();
    expect(screen.getByTestId('network-ledger')).toHaveTextContent('100.00');
    expect(screen.getByText('الدفترُ والسنداتُ متطابقان')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('سندات من'), '2026-07-01');
    await userEvent.type(screen.getByLabelText('إلى'), '2026-07-31');
    expect(await screen.findByTestId('open-hint')).toHaveTextContent('100.00');
    expect(vi.mocked(banks.getOpenNetworkReceipts)).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-07-31' });
    await userEvent.type(screen.getByLabelText('العمولة'), '2');
    await userEvent.type(screen.getByLabelText('ضريبة العمولة'), '0.3');
    // الصافي المعروض تلميحٌ محسوب من رقم الخادم: 100 − 2 − 0.3
    expect(screen.getByTestId('open-hint')).toHaveTextContent('97.70');
    await userEvent.click(screen.getByText('رحِّل التسوية'));
    expect(vi.mocked(banks.createNetworkSettlement)).toHaveBeenCalledWith(expect.objectContaining({ bankId: 'b1', periodFrom: '2026-07-01', periodTo: '2026-07-31', feeAmount: 2, feeVatAmount: 0.3 }));
    expect(await screen.findByTestId('settlement-notice')).toHaveTextContent('NS-2026-0002');
  });

  it('الإلغاءُ عكسٌ للمرحَّلة وحدَها، والفرقُ بين الدفتر والسندات يُعلَن كما قاله الخادم', async () => {
    vi.mocked(banks.listNetworkSettlements).mockResolvedValue({
      items: [settlement(), settlement({ id: 'ns0', no: 'NS-2026-0000', status: 'VOID' })],
      summary: { ledger: '445.00', open: '100.00', openCount: 1, matched: false },
    });
    render(<NetworkSettlementsPanel banks={bankRows} onClose={() => {}} />);
    await screen.findByText('NS-2026-0000');
    expect(screen.getByTestId('network-gap')).toBeInTheDocument();
    expect(screen.getAllByText('↩ ألغِ (عكس)')).toHaveLength(1);
    await userEvent.click(screen.getByText('↩ ألغِ (عكس)'));
    expect(vi.mocked(banks.voidNetworkSettlement)).toHaveBeenCalledWith('ns1');
    expect(await screen.findByTestId('settlement-notice')).toHaveTextContent('JE-2026-0021');
  });
});
