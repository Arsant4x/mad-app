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
  subtotal: string;
  taxTotal: string;
  total: string;
  notes: string | null;
  lines: InvoiceLine[];
}

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
  lines: InvoiceLineInput[];
}

export type UpdateInvoiceInput = Partial<CreateInvoiceInput> & { status?: InvoiceStatus };

export const listInvoices = () => apiClient.get<Invoice[]>('/invoices').then((r) => r.data);
export const createInvoice = (dto: CreateInvoiceInput) => apiClient.post<Invoice>('/invoices', dto).then((r) => r.data);
export const updateInvoice = (id: string, dto: UpdateInvoiceInput) => apiClient.patch<Invoice>(`/invoices/${id}`, dto).then((r) => r.data);
export const deleteInvoice = (id: string) => apiClient.delete(`/invoices/${id}`);
