import { today } from '../lib/format';
import { apiClient } from './client';

/** نقداً من الصندوق، أو تحويلٌ من حساب بنك — **ولا شبكة** لسداد مورّد (`ق-٨٧٢`). */
export type SupplierPaymentMethod = 'CASH' | 'BANK';

export interface SupplierPaymentAllocation {
  id: string;
  purchaseId: string;
  amount: string;
  purchase: { id: string; no: string; total: string; currency: string };
}

/** سندُ صرفٍ لمورّد — مرآةُ سند القبض في جدولٍ مستقلّ (`ق-٨٧١`). */
export interface SupplierPayment {
  id: string;
  no: string;
  supplierId: string;
  supplier: { id: string; name: string };
  branchId: string | null;
  date: string;
  amount: string;
  method: SupplierPaymentMethod;
  bankId: string | null;
  reference: string | null;
  notes: string | null;
  currency: string;
  exchangeRate: string;
  journalEntryId: string | null;
  /** غيرُ فارغ ⇒ هذا سندٌ عاكس، لا يُعكس ولا يُعاد توزيعه. */
  reversesId: string | null;
  allocations: SupplierPaymentAllocation[];
  createdAt: string;
}

/** فاتورةُ شراءٍ مفتوحة بمتبقّيها — **محسوباً في الخادم من التخصيصات** لا من حقل. */
export interface OpenPurchase {
  id: string;
  no: string;
  date: string;
  dueDate: string | null;
  total: string;
  currency: string;
  status: string;
  allocated: number;
  remaining: number;
}

export interface SupplierAllocationInput {
  purchaseId: string;
  amount: number;
}

export interface SupplierPaymentInput {
  supplierId: string;
  branchId?: string;
  date: string;
  amount: number;
  method: SupplierPaymentMethod;
  bankId?: string;
  reference?: string;
  notes?: string;
  currency?: string;
  exchangeRate?: number;
  allocations?: SupplierAllocationInput[];
}

export const listSupplierPayments = (supplierId?: string) =>
  apiClient.get<SupplierPayment[]>('/supplier-payments', { params: supplierId ? { supplierId } : {} }).then((r) => r.data);
export const listOpenPurchases = (supplierId: string) =>
  apiClient.get<OpenPurchase[]>(`/supplier-payments/open-purchases/${supplierId}`).then((r) => r.data);
export const createSupplierPayment = (dto: SupplierPaymentInput) => apiClient.post<SupplierPayment>('/supplier-payments', dto).then((r) => r.data);
export const allocateSupplierPayment = (id: string, allocations: SupplierAllocationInput[]) =>
  apiClient.post<SupplierPayment>(`/supplier-payments/${id}/allocate`, { allocations }).then((r) => r.data);
/** التصحيحُ الوحيد: سندٌ عاكس — لا حذفَ ولا تعديلَ لمرحَّل. ويومُه يومُ التاجر (`ق-٧٣٦`). */
export const reverseSupplierPayment = (id: string, reason?: string) =>
  apiClient.post<SupplierPayment>(`/supplier-payments/${id}/reverse`, { reason, date: today() }).then((r) => r.data);
