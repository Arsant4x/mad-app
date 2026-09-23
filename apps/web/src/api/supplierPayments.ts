import { today } from '../lib/format';
import type { MoneyText } from '../lib/money';
import { apiClient } from './client';

/**
 * طريقةُ سند الصرف **كما يحملها عمودُه** (`PaymentMethod` — ومنها `CARD`) — `ق-١٣٦٧`: العمودُ التعدادُ المشترك ولا قيدَ فيه يمنع
 * الشبكة، فالشاشةُ تعرف القيمَ كلَّها. **وما يُرسَل** `SupplierPaymentInputMethod`: نقداً أو تحويلاً — **ولا شبكة** لسداد مورّد (`ق-٨٧٢`).
 */
export type SupplierPaymentMethod = 'CASH' | 'BANK' | 'CARD';
/** ما يقبله الخادمُ في إنشاء السند (`@IsIn` على `CreateSupplierPaymentDto.method`). */
export type SupplierPaymentInputMethod = 'CASH' | 'BANK';

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
  /** مجموعُ التخصيصات وما بقي بلا تخصيص — من الخادم كسند القبض (`ق-١٢٤٣`)؛ نصٌّ بخانتين. */
  allocatedTotal: MoneyText;
  unallocated: MoneyText;
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
  /** ② مالٌ نصّاً بخانتين (`ق-١٢٣٥`): يُقرأ بـ`num0()` قبل أي حساب. */
  allocated: MoneyText;
  /** ما ائتمن به المورّد على المستند بإشعاراته الدائنة — نصٌّ بخانتين. */
  credited: MoneyText;
  remaining: MoneyText;
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
  method: SupplierPaymentInputMethod;
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
