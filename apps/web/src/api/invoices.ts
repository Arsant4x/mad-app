import { apiClient } from './client';
import type { Customer } from './customers';

export type { Customer } from './customers';

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

/**
 * ⚠️ يجب أن يطابق `enum InvoiceStatus` في prisma/schema.prisma حرفياً.
 *
 * لا رابط آلي بين الاثنين: هذا النوع مكتوب بيد، فقيمةٌ تُضاف في المخطط تمرّ
 * صامتة هنا. حدث ذلك مع PARTIAL في 4.5 — أُضيفت للمخطط ولـrecomputeInvoiceStatus
 * ونُسيت هنا، فانهارت الشاشات عند أول فاتورة مسدَّدة جزئياً على بيانات حقيقية.
 */
export type InvoiceStatus = 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE';

/** Credit/debit notes are invoice rows too (ZATCA's chain runs across all
 * document kinds); amounts stay positive — `docType` carries the direction. */
export type InvoiceDocType = 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';

export interface Invoice {
  docType: InvoiceDocType;
  /** Credit/debit notes only: the invoice this note adjusts. */
  relatedInvoice: { id: string; no: string } | null;
  /** Credit/debit notes only: the reason the note was issued (goes to ZATCA). */
  adjustmentReason: string | null;
  /** POS فقط: كيف دُفعت (CASH/CARD) وأي مناوبة سجّلتها. */
  paymentMethod?: string | null;
  posPayments?: { method: string; amount: string | number }[];
  posShiftId?: string | null;
  id: string;
  no: string;
  customerId: string;
  customer: Customer;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  branchId: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  notes: string | null;
  /** ما تبقّى على هذا المستند فعلاً: الإجمالي − الإشعارات الدائنة − المقبوض.
   *  يُحسب في الخادم (invoices.service.ts outstandingOf) فلا تُعيد كل شاشة
   *  حسابه بطريقتها — وهو ما أنتج رقمين مختلفين لنفس العميل. */
  outstanding: number;
  /** كم رُدّ من هذه الفاتورة بإشعارات دائنة. */
  creditedTotal: number;
  /** Base64 TLV for the ZATCA phase-1 QR, or null while the company profile
   * is missing its legal name or VAT number. Built server-side. */
  zatcaQr: string | null;

  /** Phase 2 — where this invoice stands with the authority. All null/default
   * until it is submitted; the chain values are assigned at submission and
   * kept across retries. */
  zatcaStatus: ZatcaInvoiceStatus;
  /** The authority's clearance or rejection note, or the local reason a
   * submission could not be completed. */
  zatcaMessage: string | null;
  zatcaSubmittedAt: string | null;
  /** Invoice Counter Value — position in the company's submission sequence. */
  zatcaIcv: number | null;
  lines: InvoiceLine[];
}

export type ZatcaInvoiceStatus = 'NOT_SUBMITTED' | 'SUBMITTING' | 'CLEARED' | 'REJECTED';

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface CreateInvoiceInput {
  customerId: string;
  issueDate: string;
  /** لحظةُ الإصدار عند الجهاز وانحرافُه — يُرسَلان معاً حين يكون التاريخ اليوم (ق-١٨٥). */
  issuedAt?: string;
  issuedOffsetMin?: number;
  dueDate: string;
  notes?: string;
  /** Omit for a company-wide invoice; the server rejects a branch the signed-in
   * user isn't allowed to write to. */
  branchId?: string;
  lines: InvoiceLineInput[];
}

export type UpdateInvoiceInput = Partial<CreateInvoiceInput> & { status?: InvoiceStatus };

export interface CreateCreditNoteInput {
  /** Required — ZATCA rejects a credit note without its reason. */
  reason: string;
  /** The user's local calendar date — the server clock is UTC, so omitting
   * this can stamp a late-night note with yesterday's date. */
  issueDate?: string;
  /** Omit for a full credit of the original invoice. */
  lines?: InvoiceLineInput[];
}

export const listInvoices = () => apiClient.get<Invoice[]>('/invoices').then((r) => r.data);
export const createInvoice = (dto: CreateInvoiceInput) => apiClient.post<Invoice>('/invoices', dto).then((r) => r.data);
export const updateInvoice = (id: string, dto: UpdateInvoiceInput) => apiClient.patch<Invoice>(`/invoices/${id}`, dto).then((r) => r.data);
export const deleteInvoice = (id: string) => apiClient.delete(`/invoices/${id}`);
export const issueCreditNote = (invoiceId: string, dto: CreateCreditNoteInput) => apiClient.post<Invoice>(`/invoices/${invoiceId}/credit-note`, dto).then((r) => r.data);

export interface CreateDebitNoteInput {
  reason: string;
  issueDate?: string;
  /** Required — a debit note bills specific additional amounts; there is no
   * full-copy default (that would be accidental double-billing). */
  lines: InvoiceLineInput[];
}

export const issueDebitNote = (invoiceId: string, dto: CreateDebitNoteInput) => apiClient.post<Invoice>(`/invoices/${invoiceId}/debit-note`, dto).then((r) => r.data);
