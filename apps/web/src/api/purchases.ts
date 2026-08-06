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
  total: string;
  paid: boolean;
  paidDate: string | null;
}

export interface CreatePurchaseInput {
  supplierId: string;
  /** Omit for a company-wide record. */
  branchId?: string;
  date: string;
  dueDate?: string;
  category?: string;
  subtotal: number;
  exempt?: boolean;
  excludeFromVat?: boolean;
  amortize?: boolean;
  amortizeMonths?: number;
}

export type UpdatePurchaseInput = Partial<CreatePurchaseInput> & { paid?: boolean; paidDate?: string };

export const listPurchases = () => apiClient.get<Purchase[]>('/purchases').then((r) => r.data);
export const createPurchase = (dto: CreatePurchaseInput) => apiClient.post<Purchase>('/purchases', dto).then((r) => r.data);
export const updatePurchase = (id: string, dto: UpdatePurchaseInput) => apiClient.patch<Purchase>(`/purchases/${id}`, dto).then((r) => r.data);
export const deletePurchase = (id: string) => apiClient.delete(`/purchases/${id}`);
