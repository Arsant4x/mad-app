import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentModal } from './PaymentModal';
import * as payments from '../../api/payments';
import { listCustomers } from '../../api/customers';
import { listBranches } from '../../api/branches';
import { listBanks } from '../../api/banks';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (20.0 ث).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 60_000 });

vi.mock('../../api/payments');
vi.mock('../../api/customers', () => ({ listCustomers: vi.fn() }));
vi.mock('../../api/branches', () => ({ listBranches: vi.fn() }));
vi.mock('../../api/banks', () => ({ listBanks: vi.fn() }));

/** ④A1 — فائضُ سند القبض فوق المخصَّص يُعلَن مصيرُه في الشاشة ويُرسَل كما أُعلن؛ ولا يُفترض. */
describe('سندُ القبض — مصيرُ الفائض غير المخصَّص (④A1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCustomers).mockResolvedValue([
      { archived: false, id: 'c1', name: 'عميل الدفعة', kind: 'NATURAL', otherIdScheme: null, otherId: null, country: 'SA', vatNumber: null, phone: null, creditLimit: '0.00' },
    ]);
    vi.mocked(listBranches).mockResolvedValue([]);
    vi.mocked(listBanks).mockResolvedValue([]);
    vi.mocked(payments.listOpenInvoices).mockResolvedValue([]);
    vi.mocked(payments.createPayment).mockResolvedValue({} as payments.Payment);
  });

  it('فائضٌ بلا إعلانٍ يُوقَف قبل الإرسال؛ والمعلَنُ دفعةً مقدَّمة يُرسَل بعلَمه', async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(<PaymentModal onCancel={() => {}} onSaved={onSaved} />);
    await screen.findByRole('option', { name: 'عميل الدفعة' });
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'c1');
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1150' } });

    // لا فواتير مفتوحة: الفائضُ هو السندُ كلُّه — والسؤالُ يظهر.
    expect(await screen.findByTestId('unallocated-fate')).toBeInTheDocument();
    await userEvent.click(screen.getByText('تسجيل السند'));
    expect(vi.mocked(payments.createPayment)).not.toHaveBeenCalled();
    expect(screen.getByText(/أعلن ما يكون/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /دفعة مقدَّمة/ }));
    // ق-١٢٦٤/②: الفئةُ تُختار ولا تُفترض — بلا اختيارٍ يُوقَف الإرسال.
    await userEvent.click(screen.getByText('تسجيل السند'));
    expect(vi.mocked(payments.createPayment)).not.toHaveBeenCalled();
    // الرسالةُ في فقرة الخطأ بعينها — فالعبارةُ نفسُها في عنوان الحقل أيضاً.
    expect(screen.getByText(/اخترها .*تُعلَن ولا تُفترض/)).toHaveClass('error-text');
    await userEvent.selectOptions(screen.getByLabelText('فئة الدفعة المقدَّمة'), 'E');
    await userEvent.selectOptions(screen.getByLabelText('سبب الإعفاء'), 'VATEX-SA-30');
    await userEvent.click(screen.getByText('تسجيل السند'));
    expect(vi.mocked(payments.createPayment)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(payments.createPayment).mock.calls[0][0]).toMatchObject({ customerId: 'c1', amount: 1150, method: 'CASH', unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-30' } });
    expect(onSaved).toHaveBeenCalled();
  });

  it('سندٌ موزَّعٌ كلُّه لا يُسأل عن مصيرٍ ولا يحمل علَماً', async () => {
    vi.mocked(payments.listOpenInvoices).mockResolvedValue([
      { id: 'i1', no: 'INV-2026-0001', issueDate: '2026-06-01', dueDate: '2026-06-30', total: '400.00', currency: 'SAR', status: 'DUE', allocated: '0.00', remaining: '400.00' },
    ]);
    render(<PaymentModal onCancel={() => {}} onSaved={vi.fn().mockResolvedValue(undefined)} />);
    await screen.findByRole('option', { name: 'عميل الدفعة' });
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'c1');
    await screen.findByText('INV-2026-0001');
    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: '400' } });
    await userEvent.click(screen.getByText('توزيع تلقائي (الأقدم أولاً)'));
    expect(screen.queryByTestId('unallocated-fate')).toBeNull();
    await userEvent.click(screen.getByText('تسجيل السند'));
    expect(vi.mocked(payments.createPayment)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(payments.createPayment).mock.calls[0][0]).not.toHaveProperty('unallocated');
    expect(vi.mocked(payments.createPayment).mock.calls[0][0].allocations).toEqual([{ invoiceId: 'i1', amount: 400 }]);
  });

  it('⚖️ مفتاحُ النافذة يُرسل، ويبقى نفسَه حين يُعاد الحفظ بعد إخفاق — فلا يُكتب سندان (توجيه ٢٧٦ · ق-١٦٠٩/ب)', async () => {
    vi.mocked(payments.listOpenInvoices).mockResolvedValue([
      { id: 'i1', no: 'INV-2026-0002', issueDate: '2026-06-01', dueDate: '2026-06-30', total: '400.00', currency: 'SAR', status: 'DUE', allocated: '0.00', remaining: '400.00' },
    ]);
    // الأولى تنقطع (لا جوابَ يصل)، والثانيةُ تنجح — والمفتاحُ واحد، فالخادمُ يعيد السندَ إن كانت الأولى كتبته.
    vi.mocked(payments.createPayment).mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce({} as payments.Payment);
    render(<PaymentModal onCancel={() => {}} onSaved={vi.fn().mockResolvedValue(undefined)} />);
    await screen.findByRole('option', { name: 'عميل الدفعة' });
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'c1');
    await screen.findByText('INV-2026-0002');
    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: '400' } });
    await userEvent.click(screen.getByText('توزيع تلقائي (الأقدم أولاً)'));
    await userEvent.click(screen.getByText('تسجيل السند'));
    await userEvent.click(screen.getByText('تسجيل السند'));
    expect(vi.mocked(payments.createPayment)).toHaveBeenCalledTimes(2);
    const [first, second] = vi.mocked(payments.createPayment).mock.calls;
    expect(typeof first[1]).toBe('string');
    expect(String(first[1]).length).toBeGreaterThanOrEqual(8);
    expect(second[1]).toBe(first[1]);
  });
});
