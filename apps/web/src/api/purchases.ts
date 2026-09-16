import { apiClient } from './client';
import type { Supplier } from './suppliers';

export interface Purchase {
  id: string;
  branchId: string | null;
  no: string;
  supplierId: string;
  supplier: Supplier;
  date: string;
  dueDate: string | null;
  category: string | null;
  subtotal: string;
  taxAmount: string;
  exempt: boolean;
  excludeFromVat: boolean;
  amortize: boolean;
  amortizeMonths: number | null;
  incorpItem: string | null;
  total: string;
  currency: string;
  /** مشتقّةٌ مخزَّنة من تخصيصات سندات الصرف (`ق-٨٧٢`) — لا علَمَ يُكتب بيد. */
  status: PurchaseStatus;
  /** المسدَّدُ والمتبقّي — **محسوبان في الخادم من التخصيصات** لا من حقل. */
  allocated: number;
  remaining: number;
}

export type PurchaseStatus = 'DUE' | 'PARTIAL' | 'PAID';

export interface CreatePurchaseInput {
  supplierId: string;
  /** Omit for a company-wide record. */
  branchId?: string;
  date: string;
  dueDate?: string;
  /** لافتةٌ حرّة للعرض. */
  category?: string;
  /** الرمز الذي يقرّر: الإطفاء · تقرير التأسيس · حساب الترحيل. */
  categoryCode?: string;
  subtotal: number;
  exempt?: boolean;
  excludeFromVat?: boolean;
  amortize?: boolean;
  amortizeMonths?: number;
  incorpItem?: string;
}

/** لا `paid` هنا (`ق-٨٧٤`): السدادُ سندُ صرفٍ (`supplierPayments.ts`) — والخادمُ يرفض العلَمَ القديم بـ400. */
export type UpdatePurchaseInput = Partial<CreatePurchaseInput>;

export const listPurchases = () => apiClient.get<Purchase[]>('/purchases').then((r) => r.data);
export const createPurchase = (dto: CreatePurchaseInput) => apiClient.post<Purchase>('/purchases', dto).then((r) => r.data);
export const updatePurchase = (id: string, dto: UpdatePurchaseInput) => apiClient.patch<Purchase>(`/purchases/${id}`, dto).then((r) => r.data);
export const deletePurchase = (id: string) => apiClient.delete(`/purchases/${id}`);

/** تقرير مصاريف التأسيس — grouped by line item, base currency. */
export interface IncorporationReport {
  total: number;
  invoiceCount: number;
  amortizedCount: number;
  items: { item: string; count: number; total: number; method: string }[];
}
export const getIncorporationReport = () => apiClient.get<IncorporationReport>('/purchases/incorporation-report').then((r) => r.data);

/** مستند فاتورة المصروف (§5) — نفس نمط مرفقات العقود: البايتات في التخزين،
 * والرابط موقَّع قصير العمر يُطلب عند الفتح فقط. */
export interface PurchaseAttachment {
  id: string;
  purchaseId: string;
  filename: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

export const listPurchaseAttachments = (purchaseId: string) =>
  apiClient.get<PurchaseAttachment[]>(`/purchases/${purchaseId}/attachments`).then((r) => r.data);

export const uploadPurchaseAttachment = async (purchaseId: string, file: File): Promise<PurchaseAttachment> => {
  const form = new FormData();
  // Content-Type left unset so the browser adds the multipart boundary itself.
  form.append('file', file);
  const res = await apiClient.post<PurchaseAttachment>(`/purchases/${purchaseId}/attachments`, form);
  return res.data;
};

export const purchaseAttachmentDownloadUrl = (attachmentId: string) =>
  apiClient.get<{ url: string; expiresInSeconds: number }>(`/purchases/attachments/${attachmentId}/download-url`).then((r) => r.data);

export const deletePurchaseAttachment = (attachmentId: string) => apiClient.delete(`/purchases/attachments/${attachmentId}`);
