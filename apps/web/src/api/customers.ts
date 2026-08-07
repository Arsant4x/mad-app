import { apiClient } from './client';

export interface Customer {
  archived: boolean;
  id: string;
  name: string;
  vatNumber: string | null;
  phone: string | null;
  creditLimit: string;
}

export interface CustomerInput {
  name: string;
  vatNumber?: string;
  phone?: string;
  creditLimit?: number;
}

export const listCustomers = (includeArchived = false) => apiClient.get<Customer[]>('/customers', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const createCustomer = (dto: CustomerInput) => apiClient.post<Customer>('/customers', dto).then((r) => r.data);
export const updateCustomer = (id: string, dto: Partial<CustomerInput>) => apiClient.patch<Customer>(`/customers/${id}`, dto).then((r) => r.data);
export const deleteCustomer = (id: string) => apiClient.delete(`/customers/${id}`);

/** أرشفة/إلغاء أرشفة — إخفاء من القوائم اليومية مع البقاء في الحسابات. */
export const setCustomerArchived = (id: string, archived: boolean) => apiClient.patch<Customer>(`/customers/${id}/archive`, { archived }).then((r) => r.data);
