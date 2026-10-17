import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierPaymentModal } from './SupplierPaymentModal';
import * as supplierPayments from '../../api/supplierPayments';
import { listBranches } from '../../api/branches';
import { listBanks } from '../../api/banks';
import type { Currency } from '../../api/currencies';
import type { Purchase } from '../../api/purchases';
import { StaticCurrencies } from '../../components/currency/CurrencyContext';

// File budget: two small renders with clicks, three times the measured time under the full suite.
vi.setConfig({ testTimeout: 30_000 });

vi.mock('../../api/supplierPayments');
vi.mock('../../api/branches', () => ({ listBranches: vi.fn() }));
vi.mock('../../api/banks', () => ({ listBanks: vi.fn() }));

const currency = (code: string, isBase = false): Currency => ({ id: code, code, name: code, symbol: null, isBase, rate: '1' });
const companyCurrencies = [currency('SAR', true), currency('USD')];

const openPurchase = (id: string, no: string, date: string, currencyCode: string, remaining: string): supplierPayments.OpenPurchase => ({
  id,
  no,
  date,
  dueDate: null,
  total: remaining,
  currency: currencyCode,
  status: 'DUE',
  allocated: '0.00',
  credited: '0.00',
  remaining,
});

const purchaseFrom = (open: supplierPayments.OpenPurchase): Purchase =>
  ({
    id: open.id,
    no: open.no,
    branchId: null,
    supplierId: 's1',
    supplier: { id: 's1', name: 'Supplier one' },
    date: open.date,
    total: open.total,
    currency: open.currency,
    remaining: open.remaining,
  }) as unknown as Purchase;

describe('Supplier payment modal: allocation in the voucher currency only', () => {
  // The server orders by date, so the older USD purchase comes first.
  const usd = openPurchase('p-usd', 'PUR-2026-0201', '2026-04-01', 'USD', '200.00');
  const sar = openPurchase('p-sar', 'PUR-2026-0202', '2026-05-01', 'SAR', '300.00');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listBranches).mockResolvedValue([]);
    vi.mocked(listBanks).mockResolvedValue([]);
    vi.mocked(supplierPayments.listOpenPurchases).mockResolvedValue([usd, sar]);
    vi.mocked(supplierPayments.createSupplierPayment).mockResolvedValue({} as supplierPayments.SupplierPayment);
  });

  it('lists and auto allocates only the purchases in the base currency, and says how many were left out', async () => {
    render(
      <StaticCurrencies currencies={companyCurrencies}>
        <SupplierPaymentModal purchase={purchaseFrom(sar)} onCancel={() => {}} onSaved={vi.fn().mockResolvedValue(undefined)} />
      </StaticCurrencies>,
    );
    await screen.findByText('PUR-2026-0202');
    expect(screen.queryByText('PUR-2026-0201')).toBeNull();
    expect(screen.getByTestId('other-currency-excluded')).toHaveTextContent('1');
    expect(screen.getByTestId('other-currency-excluded')).toHaveTextContent('SAR');

    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: '300' } });
    await userEvent.click(screen.getByText('توزيع تلقائي (الأقدم أولاً)'));
    await userEvent.click(screen.getByText('تسجيل السند'));
    expect(vi.mocked(supplierPayments.createSupplierPayment)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(supplierPayments.createSupplierPayment).mock.calls[0][0].allocations).toEqual([{ purchaseId: 'p-sar', amount: 300 }]);
  });

  it('sends no allocation on the purchase it was opened from when that purchase is in another currency', async () => {
    render(
      <StaticCurrencies currencies={companyCurrencies}>
        <SupplierPaymentModal purchase={purchaseFrom(usd)} onCancel={() => {}} onSaved={vi.fn().mockResolvedValue(undefined)} />
      </StaticCurrencies>,
    );
    await screen.findByText('PUR-2026-0202');
    await userEvent.click(screen.getByText('تسجيل السند'));
    expect(vi.mocked(supplierPayments.createSupplierPayment)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(supplierPayments.createSupplierPayment).mock.calls[0][0].allocations).toEqual([]);
  });
});
