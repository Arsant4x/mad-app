import { today } from '../lib/format';
import { apiClient } from './client';

export type PaymentMethod = 'CASH' | 'BANK';

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
  createdAt: string;
}

/** فاتورة مفتوحة بمتبقّيها — **محسوباً في الخادم من التخصيصات** لا من حقل. */
export interface OpenInvoice {
  id: string;
  no: string;
  issueDate: string;
  dueDate: string;
  total: string;
  currency: string;
  status: string;
  allocated: number;
  remaining: number;
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
