import { apiClient } from './client';

export interface Customer {
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

export const listCustomers = () => apiClient.get<Customer[]>('/customers').then((r) => r.data);
export const createCustomer = (dto: CustomerInput) => apiClient.post<Customer>('/customers', dto).then((r) => r.data);
export const updateCustomer = (id: string, dto: Partial<CustomerInput>) => apiClient.patch<Customer>(`/customers/${id}`, dto).then((r) => r.data);
export const deleteCustomer = (id: string) => apiClient.delete(`/customers/${id}`);
