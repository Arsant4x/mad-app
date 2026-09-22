import { today } from '../lib/format';
import type { MoneyText } from '../lib/money';
import { apiClient } from './client';

/** `CARD` هي الشبكة (`ق-٣٢٠`): تُقيَّد على `1251` حتى يحوّلها المستحوذ — بلا بنك؛ تسويةُ الشبكة تُدخلها البنكَ صافيةً (⑦A2). */
export type PaymentMethod = 'CASH' | 'BANK' | 'CARD';

export interface PaymentAllocation {
  id: string;
  invoiceId: string;
  amount: string;
  invoice: { id: string; no: string; total: string; currency: string };
}

export interface Payment {
  id: string;
  no: string;
  customerId: string;
  customer: { id: string; name: string };
  branchId: string | null;
  date: string;
  amount: string;
  method: PaymentMethod;
  bankId: string | null;
  reference: string | null;
  notes: string | null;
  currency: string;
  exchangeRate: string;
  journalEntryId: string | null;
  /** غير فارغ ⇒ هذا سند عكسي، لا يُعكس ولا يُعاد توزيعه. */
  reversesId: string | null;
  allocations: PaymentAllocation[];
  /** مجموعُ التخصيصات وما بقي بلا تخصيص — من الخادم لا من جمع الشاشة (`ق-١٢٤٣`)؛ نصٌّ بخانتين. */
  allocatedTotal: MoneyText;
  unallocated: MoneyText;
  /** ④A1: فاتورةُ الدفعة المقدَّمة (386) التي أصدرها فائضُ هذا السند — إن أُعلن دفعةً مقدَّمة. */
  prepaymentInvoice?: { id: string; no: string; total: MoneyText; onAccountRemainder?: MoneyText } | null;
  createdAt: string;
}

/**
 * ④A1: مصيرُ ما في السند فوق المخصَّص — يُعلَن حين يفوق هللاتِ التدوير (`UNALLOCATED_DECLARATION_MIN`، والخادمُ الحكم):
 * دفعةٌ مقدَّمة تُصدر فاتورةَ 386 يومَ القبض، أو على الحساب حين تغطّيه فواتيرُ العميل المفتوحة.
 */
export type UnallocatedFate = 'PREPAYMENT' | 'ON_ACCOUNT';
export const UNALLOCATED_DECLARATION_MIN = 0.05;

/** فاتورة مفتوحة بمتبقّيها — **محسوباً في الخادم من التخصيصات** لا من حقل. */
export interface OpenInvoice {
  id: string;
  no: string;
  issueDate: string;
  dueDate: string;
  total: string;
  currency: string;
  status: string;
  /** ② مالٌ نصّاً بخانتين (`ق-١٢٣٥`): يُقرأ بـ`num0()` قبل أي حساب. */
  allocated: MoneyText;
  remaining: MoneyText;
}

export interface AllocationInput {
  invoiceId: string;
  amount: number;
}

export interface PaymentInput {
  customerId: string;
  branchId?: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  bankId?: string;
  reference?: string;
  notes?: string;
  currency?: string;
  exchangeRate?: number;
  allocations?: AllocationInput[];
  /** ④A1: مصيرُ الفائض غير المخصَّص — إلزاميٌّ من الخادم حين يفوق هللاتِ التدوير. */
  unallocated?: UnallocatedFate;
  /** ④A1 (`ق-١٢٦٤`/②): فئةُ ما يُدفع مقدَّماً عنه — إلزاميةٌ من الخادم مع `PREPAYMENT`، ولا تُفترض. */
  prepaymentTax?: { taxCategory: 'S' | 'Z' | 'E' | 'O'; taxExemptionReasonCode?: string; taxExemptionReason?: string };
}

export const listPayments = (customerId?: string) =>
  apiClient.get<Payment[]>('/payments', { params: customerId ? { customerId } : {} }).then((r) => r.data);
export const getPayment = (id: string) => apiClient.get<Payment>(`/payments/${id}`).then((r) => r.data);
export const listOpenInvoices = (customerId: string) => apiClient.get<OpenInvoice[]>(`/payments/open-invoices/${customerId}`).then((r) => r.data);
export const createPayment = (dto: PaymentInput) => apiClient.post<Payment>('/payments', dto).then((r) => r.data);
export const allocatePayment = (id: string, allocations: AllocationInput[]) =>
  apiClient.post<Payment>(`/payments/${id}/allocate`, { allocations }).then((r) => r.data);
/** التصحيح الوحيد: سند عكسي — لا حذف ولا تعديل لمرحَّل. ويومُه يومُ التاجر (`today()` بتقويم الجهاز) لا يومُ الخادم (ق-٧٣٦). */
export const reversePayment = (id: string, reason?: string) =>
  apiClient.post<Payment>(`/payments/${id}/reverse`, { reason, date: today() }).then((r) => r.data);
