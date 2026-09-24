import { apiClient } from './client';
import type { Invoice } from './invoices';
import type { DeclarableTaxCategory, TaxCategory } from '../lib/vat';
import type { QuoteStatus } from '@mad-app/shared/api/enums';

export type { QuoteStatus };
/** EXPIRED مشتقة قراءةً من validUntil — لا تُخزَّن. */
export type DerivedQuoteStatus = QuoteStatus | 'EXPIRED';

export interface QuoteLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  /** ⑧ مشتقّةٌ من الفئة — للقراءة. */
  taxRate: string;
  taxCategory: TaxCategory;
  taxExemptionReasonCode: string | null;
  taxExemptionReason: string | null;
}

export interface Quote {
  id: string;
  no: string;
  customerId: string;
  customer: { id: string; name: string };
  branchId: string | null;
  issueDate: string;
  validUntil: string;
  status: QuoteStatus;
  derivedStatus: DerivedQuoteStatus;
  notes: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  convertedInvoiceId: string | null;
  convertedInvoice?: { id: string; no: string } | null;
  convertedAt: string | null;
  lines: QuoteLine[];
  createdAt: string;
}

export interface QuoteLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  /** ⑧ الفئةُ والسبب — كما في بند الفاتورة؛ والنسبةُ يشتقّها الخادم. */
  taxCategory: DeclarableTaxCategory;
  taxExemptionReasonCode?: string;
  taxExemptionReason?: string;
}

export interface QuoteInput {
  customerId: string;
  branchId?: string;
  issueDate: string;
  validUntil: string;
  notes?: string;
  lines: QuoteLineInput[];
}

export const listQuotes = () => apiClient.get<Quote[]>('/quotes').then((r) => r.data);
export const getQuote = (id: string) => apiClient.get<Quote>(`/quotes/${id}`).then((r) => r.data);
export const createQuote = (dto: QuoteInput) => apiClient.post<Quote>('/quotes', dto).then((r) => r.data);
export const updateQuote = (id: string, dto: Partial<QuoteInput> & { status?: 'DRAFT' | 'SENT' }) =>
  apiClient.patch<Quote>(`/quotes/${id}`, dto).then((r) => r.data);
export const deleteQuote = (id: string) => apiClient.delete(`/quotes/${id}`);

/** التحويل بنقرة — يعيد العرضَ مختوماً والفاتورةَ المولودة معاً. */
export const convertQuote = (id: string) => apiClient.post<{ quote: Quote; invoice: Invoice }>(`/quotes/${id}/convert`).then((r) => r.data);
