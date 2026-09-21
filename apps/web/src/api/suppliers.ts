import type { MoneyText } from '../lib/money';
import { apiClient } from './client';

export interface Supplier {
  archived: boolean;
  id: string;
  name: string;
  vatNumber: string | null;
  phone: string | null;
  category: string | null;
}

export interface SupplierInput {
  name: string;
  vatNumber?: string;
  phone?: string;
  category?: string;
}

export const listSuppliers = (includeArchived = false) => apiClient.get<Supplier[]>('/suppliers', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const createSupplier = (dto: SupplierInput) => apiClient.post<Supplier>('/suppliers', dto).then((r) => r.data);
export const updateSupplier = (id: string, dto: Partial<SupplierInput>) => apiClient.patch<Supplier>(`/suppliers/${id}`, dto).then((r) => r.data);
export const deleteSupplier = (id: string) => apiClient.delete(`/suppliers/${id}`);

/** المفوتَرُ والمسدَّدُ والمستحقُّ في فترة — من الخادم (`GET /suppliers/:id/summary`)، لا من جمع الفواتير في النافذة (`ق-١٢٤٣`). */
export interface SupplierSummary {
  supplierId: string;
  from: string | null;
  to: string | null;
  billed: MoneyText;
  paid: MoneyText;
  due: MoneyText;
}
export const getSupplierSummary = (id: string, range: { from?: string; to?: string }) =>
  apiClient.get<SupplierSummary>(`/suppliers/${id}/summary`, { params: range }).then((r) => r.data);

/** أرشفة/إلغاء أرشفة — إخفاء من القوائم اليومية مع البقاء في الحسابات. */
export const setSupplierArchived = (id: string, archived: boolean) => apiClient.patch<Supplier>(`/suppliers/${id}/archive`, { archived }).then((r) => r.data);
