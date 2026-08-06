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

export type InvoiceStatus = 'DUE' | 'PAID' | 'OVERDUE';

export interface Invoice {
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
  dueDate: string;
  notes?: string;
  /** Omit for a company-wide invoice; the server rejects a branch the signed-in
   * user isn't allowed to write to. */
  branchId?: string;
  lines: InvoiceLineInput[];
}

export type UpdateInvoiceInput = Partial<CreateInvoiceInput> & { status?: InvoiceStatus };

export const listInvoices = () => apiClient.get<Invoice[]>('/invoices').then((r) => r.data);
export const createInvoice = (dto: CreateInvoiceInput) => apiClient.post<Invoice>('/invoices', dto).then((r) => r.data);
export const updateInvoice = (id: string, dto: UpdateInvoiceInput) => apiClient.patch<Invoice>(`/invoices/${id}`, dto).then((r) => r.data);
export const deleteInvoice = (id: string) => apiClient.delete(`/invoices/${id}`);
