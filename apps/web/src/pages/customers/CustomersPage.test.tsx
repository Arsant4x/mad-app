import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '../../api/customers';
import type { Invoice } from '../../api/invoices';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (4.8 ث).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 15_000 });

/**
 * الاختبار ٤ — «الرصيد المستحق» يطرح المقبوض.
 *
 * يحرس العطل الثالث — **وأخطرها**: العطلان الآخران ينهاران فيُريان أنفسهما،
 * وهذا كان **يعرض رقماً خاطئاً بثقة**. جمعت الشاشة `total` كل فاتورة غير
 * مدفوعة بدل ما تبقّى منها، فأظهرت 18,400 لعميل يدين بـ13,400 — والفارق هو
 * المقبوض بعينه. أي أن التاجر يطالب عميله بما دفعه.
 *
 * **والشاشةُ لم تعد تجمع شيئاً** (`ق-١٢٤٣`: الشاشةُ تقرأ ولا تحسب): الرصيدُ يصل مع صفّ
 * العميل من الخادم (`outstanding` — المصدرُ الواحد للتعرّض) نصّاً بخانتين. فالحارسُ هنا
 * يؤكّد أن **الرقم المعروض في الجدول هو رقمُ الخادم** — لا مجموعُ إجماليات الفواتير
 * التي ما زالت تُحمَّل لنافذة التفاصيل — وأن غيابَه صفرٌ لا `NaN`.
 */
vi.mock('../../api/customers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/customers')>()),
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  setCustomerArchived: vi.fn(),
  getCustomerSummary: vi.fn(),
}));
vi.mock('../../api/invoices', () => ({ listInvoices: vi.fn() }));

const { listCustomers } = await import('../../api/customers');
const { listInvoices } = await import('../../api/invoices');
const { CustomersPage } = await import('./CustomersPage');

const customer = (id: string, name: string, outstanding?: string, kind: Customer['kind'] = 'NATURAL'): Customer =>
  ({ id, name, kind, otherIdScheme: null, otherId: null, country: 'SA', vatNumber: '', phone: '', creditLimit: '0', archived: false, outstanding }) as unknown as Customer;

/** فاتورة بأقل ما تحتاجه الشاشة — إجماليُّها هو ما كانت الشاشةُ تجمعه خطأً. */
const invoice = (id: string, customerId: string, total: string, outstanding: string, status: string): Invoice =>
  ({ id, customerId, total, outstanding, status, no: `INV-${id}` }) as unknown as Invoice;

describe('الاختبار ٤ — رصيد العميل = مجموع المتبقي', () => {
  it('الرصيدُ المعروض هو رقمُ الخادم — لا مجموعُ إجماليات الفواتير غير المدفوعة', async () => {
    // الخادم يقول 13,400 (8,800 متبقّي المسدَّدة جزئياً + 4,600)؛ ومجموعُ الإجماليات 18,400 — وهو العطلُ القديم.
    vi.mocked(listCustomers).mockResolvedValue([customer('c1', 'شركة النخبة للأغذية', '13400.00')]);
    vi.mocked(listInvoices).mockResolvedValue([invoice('1', 'c1', '13800', '8800.00', 'PARTIAL'), invoice('2', 'c1', '4600', '4600.00', 'DUE')]);

    render(<CustomersPage />);

    await waitFor(() => expect(screen.getByText('13,400.00')).toBeInTheDocument());
    expect(screen.queryByText('18,400.00')).not.toBeInTheDocument();
  });

  it('رصيدٌ صفرٌ من الخادم يُعرض صفراً', async () => {
    vi.mocked(listCustomers).mockResolvedValue([customer('c2', 'مكتب البيان', '0.00')]);
    vi.mocked(listInvoices).mockResolvedValue([invoice('3', 'c2', '3450', '0.00', 'PAID')]);

    render(<CustomersPage />);

    // الخلية تعرض الاسم متبوعاً بـ👁، فالمطابقة بدالة لا بنصّ حرفي.
    await waitFor(() => expect(screen.getByText((_, el) => el?.tagName === 'TD' && !!el.textContent?.includes('مكتب البيان'))).toBeInTheDocument());
    expect(screen.getAllByText('0.00').length).toBeGreaterThan(0);
  });

  it('صفٌّ بلا رصيدٍ (ردٌّ قديم) يُعرض صفراً لا NaN', async () => {
    vi.mocked(listCustomers).mockResolvedValue([customer('c3', 'عميل جديد')]);
    vi.mocked(listInvoices).mockResolvedValue([]);

    render(<CustomersPage />);

    await waitFor(() => expect(screen.getByText((_, el) => el?.tagName === 'TD' && !!el.textContent?.includes('عميل جديد'))).toBeInTheDocument());
    expect(screen.queryByText('NaN')).not.toBeInTheDocument();
    expect(screen.getAllByText('0.00').length).toBeGreaterThan(0);
  });

  it('②A1 — الصفةُ تُعرض كما جاءت، والقديمُ غيرُ المعلَن يحمل زرَّ الإعلان الذي يفتح البطاقة', async () => {
    vi.mocked(listCustomers).mockResolvedValue([customer('c4', 'مؤسسة الرواد', '0.00', 'ESTABLISHMENT'), customer('c5', 'عميل قديم', '0.00', 'LEGACY_UNDECLARED')]);
    vi.mocked(listInvoices).mockResolvedValue([]);

    render(<CustomersPage />);

    await waitFor(() => expect(screen.getByText('مؤسسة فردية')).toBeInTheDocument());
    const declare = screen.getByTestId('declare-kind');
    expect(declare).toHaveTextContent('أعلن الصفة');
    declare.click();
    await waitFor(() => expect(screen.getByLabelText('صفة العميل')).toBeInTheDocument());
    expect(screen.getByText(/سبق البناء ولم تُعلَن صفته/)).toBeInTheDocument();
  });
});
