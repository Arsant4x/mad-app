import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceBuilderView } from './InvoiceBuilderView';
import * as invoices from '../../api/invoices';
import type { Customer } from '../../api/customers';

vi.mock('../../api/invoices', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../api/invoices')>()), listOpenPrepayments: vi.fn() }));

const customer: Customer = { archived: false, id: 'c1', name: 'عميل الدفعة', kind: 'NATURAL', otherIdScheme: null, otherId: null, country: 'SA', vatNumber: null, phone: null, creditLimit: '0.00' };

/** ④A1 — بنّاءُ الفاتورة يقرأ الدفعاتِ المقدَّمة المعلَّقة من الخادم للعميل المختار، ويرسل ما اختير منها بمعرّفاته. */
describe('بنّاءُ الفاتورة — تطبيقُ الدفعات المقدَّمة (④A1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoices.listOpenPrepayments).mockResolvedValue([
      { id: 'pp1', no: 'PP-2026-0001', issueDate: '2026-06-01T00:00:00.000Z', currency: 'SAR', receiptNo: 'RCP-2026-0007', subtotal: '1000.00', taxTotal: '150.00', total: '1150.00' },
    ]);
  });

  it('تعرض المعلَّق للعميل المختار وتخصم المختارَ في المعاينة وترسله بمعرّفه', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InvoiceBuilderView customers={[customer]} branches={[]} editing={null} nextNumberHint="INV-2026-0002" onCancel={() => {}} onSave={onSave} onCreateCustomer={vi.fn()} />);
    // لا قائمةَ قبل اختيار عميلٍ قائم.
    expect(screen.queryByTestId('open-prepayments')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('اكتب للبحث عن العميل...'), { target: { value: 'عميل الدفعة' } });
    expect(await screen.findByTestId('open-prepayments')).toBeInTheDocument();
    expect(vi.mocked(invoices.listOpenPrepayments)).toHaveBeenCalledWith('c1');
    expect(screen.getByText('PP-2026-0001')).toBeInTheDocument();
    expect(screen.getByText(/RCP-2026-0007/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByTestId('applied-prepayments')).toHaveTextContent('1,150.00');

    await userEvent.click(screen.getByText('إصدار الفاتورة'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ customerId: 'c1', prepaymentInvoiceIds: ['pp1'] });
  }, 15000);

  it('بلا اختيارٍ لا يُرسَل الحقلُ أصلاً', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InvoiceBuilderView customers={[customer]} branches={[]} editing={null} nextNumberHint="INV-2026-0002" onCancel={() => {}} onSave={onSave} onCreateCustomer={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('اكتب للبحث عن العميل...'), { target: { value: 'عميل الدفعة' } });
    await screen.findByTestId('open-prepayments');
    await userEvent.click(screen.getByText('إصدار الفاتورة'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('prepaymentInvoiceIds');
  }, 15000);
});
