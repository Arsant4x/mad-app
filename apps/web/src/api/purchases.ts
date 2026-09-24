import type { MoneyText } from '../lib/money';
import { apiClient } from './client';
import type { Supplier } from './suppliers';
import type { PurchaseDocType, PurchaseStatus } from '@mad-app/shared/api/enums';

/** نوعُ مستند الشراء — الأصلُ وإشعارا المورّد عليه (`ق-١٠٠٦`): صفٌّ في الجدول نفسِه بنوعه، كإشعار البيع. */
export type { PurchaseDocType };

export interface Purchase {
  id: string;
  branchId: string | null;
  no: string;
  docType: PurchaseDocType;
  /** الإشعاراتُ وحدَها: الشراءُ (أو الإشعارُ المقابل) الذي يصحّحه. */
  relatedPurchaseId: string | null;
  adjustmentReason: string | null;
  /** رقمُ مستند المورّد كما على ورقته — مرجعٌ خارجيٌّ لا رقمُنا. */
  supplierRef: string | null;
  /** مُلغاةٌ بقيد عكس (`ق-٩٩٧`/②) — الصفُّ يبقى ولا يُعدَّل ولا يقبل إشعاراً. */
  voidedAt: string | null;
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
  /** المسدَّدُ والمتبقّي — **محسوبان في الخادم من التخصيصات** لا من حقل.
   *  ② مالٌ نصّاً بخانتين (`ق-١٢٣٥`): يُقرأ بـ`num0()` قبل أي حساب. */
  allocated: MoneyText;
  /** ما ائتمن به المورّد على هذا المستند بإشعاراته الدائنة — يخفّض المتبقّي كما يخفّضه الإشعارُ الدائن على الفاتورة. */
  credited: MoneyText;
  remaining: MoneyText;
}

export type { PurchaseStatus };

export interface CreatePurchaseInput {
  supplierId: string;
  /** Omit for a company-wide record. */
  branchId?: string;
  date: string;
  dueDate?: string;
  /** رقمُ فاتورة المورّد — مرجعٌ خارجيٌّ يُسجَّل. */
  supplierRef?: string;
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

/** سطرُ إشعارٍ من المورّد — يشير إلى سطر الشراء الأصليّ، ويقول إن كانت البضاعةُ أُعيدت فعلاً أم أنه إشعارُ سعر. */
export interface SupplierNoteLineInput {
  description: string;
  productId?: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  returnsPurchaseLineId?: string;
  goodsReturned?: boolean;
}

/** إشعارٌ من المورّد على شراء — مستندُه يُسجَّل لا يُصدَر: سببُه وتاريخُه ورقمُه عنده، وبنودٌ أو الإشعارُ الكامل. */
export interface SupplierNoteInput {
  reason: string;
  date?: string;
  supplierRef?: string;
  lines?: SupplierNoteLineInput[];
}

export const issueSupplierCreditNote = (purchaseId: string, dto: SupplierNoteInput) =>
  apiClient.post<Purchase>(`/purchases/${purchaseId}/supplier-credit-note`, dto).then((r) => r.data);
export const issueSupplierDebitNote = (purchaseId: string, dto: SupplierNoteInput) =>
  apiClient.post<Purchase>(`/purchases/${purchaseId}/supplier-debit-note`, dto).then((r) => r.data);

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
