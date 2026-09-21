import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LedgerSection } from './LedgerSection';
import * as reports from '../../api/reports';
import { listAccounts } from '../../api/accounts';
import { listBranches } from '../../api/branches';
import { listCustomers } from '../../api/customers';
import { listSuppliers } from '../../api/suppliers';

vi.mock('../../api/reports');
vi.mock('../../api/accounts', () => ({ listAccounts: vi.fn() }));
vi.mock('../../api/branches', () => ({ listBranches: vi.fn() }));
vi.mock('../../api/customers', () => ({ listCustomers: vi.fn() }));
vi.mock('../../api/suppliers', () => ({ listSuppliers: vi.fn() }));

const row = (over: Partial<reports.LedgerRow>): reports.LedgerRow => ({
  lineId: 'l1',
  entryId: 'e1',
  entryNo: 'JE-2026-0001',
  date: '2026-06-10',
  memo: 'فاتورة',
  accountId: 'a1200',
  accountCode: '1200',
  accountName: 'الذمم المدينة',
  debit: '115.00',
  credit: '0.00',
  balance: '115.00',
  source: { type: 'INVOICE', id: 'i1', no: 'INV-2026-0001' },
  branchId: null,
  customerId: 'c1',
  supplierId: null,
  propertyId: null,
  unitId: null,
  ...over,
});

/**
 * الأستاذُ العام وكشفُ الحساب — **الشاشةُ تقرأ ولا تحسب** (`ق-١٢٤٣`): الرصيدُ الافتتاحيّ والجاري والختاميّ
 * تصل نصّاً من الخادم وتُعرض كما جاءت؛ والمصدرُ يُترجم للعرض لا يُشتقّ.
 */
describe('الأستاذُ العام وكشفُ الحساب', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAccounts).mockResolvedValue([{ id: 'a1200', code: '1200', name: 'الذمم المدينة', type: 'asset' } as never]);
    vi.mocked(listBranches).mockResolvedValue([]);
    vi.mocked(listCustomers).mockResolvedValue([{ id: 'c1', name: 'عميل الكشف' } as never]);
    vi.mocked(listSuppliers).mockResolvedValue([]);
  });

  it('دفترُ الحساب: الافتتاحيُّ والسطورُ برصيدها الجاري والختاميُّ كما أرسلها الخادم — والمصدرُ مترجَم', async () => {
    vi.mocked(reports.getLedger).mockResolvedValue({
      account: { id: 'a1200', code: '1200', name: 'الذمم المدينة', type: 'asset' },
      from: null,
      to: null,
      branchId: null,
      side: 'debit',
      opening: '20.00',
      rows: [row({}), row({ lineId: 'l2', entryNo: 'JE-2026-0002', memo: 'قبض', debit: '0.00', credit: '50.00', balance: '85.00', source: { type: 'PAYMENT', id: 'p1', no: 'RCV-2026-0001' } })],
      totalDebit: '115.00',
      totalCredit: '50.00',
      closing: '85.00',
      count: 2,
      truncated: false,
    });
    render(<LedgerSection />);
    await userEvent.selectOptions(await screen.findByLabelText('الحساب'), 'a1200');

    expect(await screen.findByText('INV-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('RCV-2026-0001')).toBeInTheDocument();
    expect(screen.getAllByText('فاتورة', { selector: 'td' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('سند قبض')).toBeInTheDocument();
    // الأرقامُ كما جاءت — لا جمعَ في الشاشة.
    expect(screen.getAllByText('85.00').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/الرصيد الافتتاحي \(مدين\)/)).toHaveTextContent('20.00');
    expect(vi.mocked(reports.getLedger)).toHaveBeenCalledWith({ accountId: 'a1200', from: undefined, to: undefined, branchId: undefined });
  });

  it('كشفُ العميل يطلب الطرفَ لا الحساب، ويُعلن القصَّ حين يُقصّ', async () => {
    vi.mocked(reports.getStatement).mockResolvedValue({
      party: { kind: 'customer', id: 'c1', name: 'عميل الكشف' },
      account: { id: 'a1200', code: '1200', name: 'الذمم المدينة', type: 'asset' },
      from: null,
      to: null,
      branchId: null,
      side: 'debit',
      opening: '0.00',
      rows: [row({})],
      totalDebit: '115.00',
      totalCredit: '0.00',
      closing: '115.00',
      count: 6000,
      truncated: true,
    });
    render(<LedgerSection />);
    await userEvent.selectOptions(screen.getByLabelText('الكشف'), 'customer');
    await userEvent.selectOptions(await screen.findByLabelText('العميل'), 'c1');

    expect(await screen.findByText(/العميل: عميل الكشف/)).toBeInTheDocument();
    expect(screen.getByText(/ضيّق المدى/)).toBeInTheDocument();
    expect(vi.mocked(reports.getStatement)).toHaveBeenCalledWith({ customerId: 'c1', from: undefined, to: undefined, branchId: undefined });
    expect(vi.mocked(reports.getLedger)).not.toHaveBeenCalled();
  });

  it('رسالةُ الخادم تُعرض كما جاءت حين يرفض', async () => {
    vi.mocked(reports.getLedger).mockRejectedValue({ response: { data: { message: 'دفتر الأستاذ يحتاج حساباً أو بُعداً' } } });
    render(<LedgerSection />);
    await userEvent.selectOptions(await screen.findByLabelText('الحساب'), 'a1200');
    expect(await screen.findByText('دفتر الأستاذ يحتاج حساباً أو بُعداً')).toBeInTheDocument();
  });
});
