import { apiClient } from './client';

export interface Supplier {
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

export const listSuppliers = () => apiClient.get<Supplier[]>('/suppliers').then((r) => r.data);
export const createSupplier = (dto: SupplierInput) => apiClient.post<Supplier>('/suppliers', dto).then((r) => r.data);
export const updateSupplier = (id: string, dto: Partial<SupplierInput>) => apiClient.patch<Supplier>(`/suppliers/${id}`, dto).then((r) => r.data);
export const deleteSupplier = (id: string) => apiClient.delete(`/suppliers/${id}`);
