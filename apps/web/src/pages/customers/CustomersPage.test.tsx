import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '../../api/customers';
import type { Invoice } from '../../api/invoices';

/**
 * الاختبار ٤ — «الرصيد المستحق» يطرح المقبوض.
 *
 * يحرس العطل الثالث — **وأخطرها**: العطلان الآخران ينهاران فيُريان أنفسهما،
 * وهذا كان **يعرض رقماً خاطئاً بثقة**. جمعت الشاشة `total` كل فاتورة غير
 * مدفوعة بدل ما تبقّى منها، فأظهرت 18,400 لعميل يدين بـ13,400 — والفارق هو
 * المقبوض بعينه. أي أن التاجر يطالب عميله بما دفعه.
 *
 * لم يُكتشف إلا بمقارنةٍ عابرة مع تقرير الأعمار. ولذلك يؤكّد هذا الاختبار
 * على **الرقم المعروض في الجدول** لا على دالةٍ داخلية.
 */
vi.mock('../../api/customers', () => ({
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  setCustomerArchived: vi.fn(),
}));
vi.mock('../../api/invoices', () => ({ listInvoices: vi.fn() }));

const { listCustomers } = await import('../../api/customers');
const { listInvoices } = await import('../../api/invoices');
const { CustomersPage } = await import('./CustomersPage');

const customer = (id: string, name: string): Customer =>
  ({ id, name, vatNumber: '', phone: '', creditLimit: '0', archived: false }) as unknown as Customer;

/** فاتورة بأقل ما تحتاجه الشاشة — و`outstanding` هو محور الاختبار. */
const invoice = (id: string, customerId: string, total: string, outstanding: number, status: string): Invoice =>
  ({ id, customerId, total, outstanding, status, no: `INV-${id}` }) as unknown as Invoice;

describe('الاختبار ٤ — رصيد العميل = مجموع المتبقي', () => {
  it('الفاتورة المسدَّدة جزئياً تُحتسب بمتبقيها لا بإجماليها', async () => {
    vi.mocked(listCustomers).mockResolvedValue([customer('c1', 'شركة النخبة للأغذية')]);
    vi.mocked(listInvoices).mockResolvedValue([
      // الحالة الواقعية بالضبط: 13,800 دُفع منها 5,000 ⇒ المتبقي 8,800
      invoice('1', 'c1', '13800', 8800, 'PARTIAL'),
      invoice('2', 'c1', '4600', 4600, 'DUE'),
    ]);

    render(<CustomersPage />);

    // 8,800 + 4,600 = 13,400 — وليس 13,800 + 4,600 = 18,400
    await waitFor(() => expect(screen.getByText('13,400.00')).toBeInTheDocument());
    expect(screen.queryByText('18,400.00')).not.toBeInTheDocument();
  });

  it('الفاتورة المدفوعة بالكامل لا تضيف شيئاً', async () => {
    vi.mocked(listCustomers).mockResolvedValue([customer('c2', 'مكتب البيان')]);
    vi.mocked(listInvoices).mockResolvedValue([invoice('3', 'c2', '3450', 0, 'PAID')]);

    render(<CustomersPage />);

    // الخلية تعرض الاسم متبوعاً بـ👁، فالمطابقة بدالة لا بنصّ حرفي.
    await waitFor(() => expect(screen.getByText((_, el) => el?.tagName === 'TD' && !!el.textContent?.includes('مكتب البيان'))).toBeInTheDocument());
    expect(screen.getAllByText('0.00').length).toBeGreaterThan(0);
  });

  it('عميل بلا فواتير رصيده صفر لا NaN', async () => {
    vi.mocked(listCustomers).mockResolvedValue([customer('c3', 'عميل جديد')]);
    vi.mocked(listInvoices).mockResolvedValue([]);

    render(<CustomersPage />);

    await waitFor(() => expect(screen.getByText((_, el) => el?.tagName === 'TD' && !!el.textContent?.includes('عميل جديد'))).toBeInTheDocument());
    expect(screen.queryByText('NaN')).not.toBeInTheDocument();
  });
});
