import type { MoneyText } from '../lib/money';
import { apiClient } from './client';

export interface Customer {
  archived: boolean;
  id: string;
  name: string;
  vatNumber: string | null;
  phone: string | null;
  creditLimit: string;
  /** رصيدُ العميل المستحقّ — من المصدر الواحد للتعرّض في الخادم (`ق-١٢٤٣`)؛ نصٌّ بخانتين، ولا يأتي مع ردود الإنشاء والتعديل. */
  outstanding?: MoneyText;
}

/** المفوتَرُ والمقبوضُ والرصيد — من الخادم (`GET /customers/:id/summary`)، لا من جمع الفواتير في النافذة. */
export interface CustomerSummary {
  customerId: string;
  billed: MoneyText;
  collected: MoneyText;
  outstanding: MoneyText;
}

export interface CustomerInput {
  name: string;
  vatNumber?: string;
  phone?: string;
  creditLimit?: number;
  /** تأكيدُ «شخصٌ آخر بالاسم نفسِه» بعد تنبيه الخادم «أهو نفسُه؟» (ق-١٠٢٨/⑤). */
  allowSameName?: boolean;
}

export const listCustomers = (includeArchived = false) => apiClient.get<Customer[]>('/customers', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const createCustomer = (dto: CustomerInput) => apiClient.post<Customer>('/customers', dto).then((r) => r.data);
export const updateCustomer = (id: string, dto: Partial<CustomerInput>) => apiClient.patch<Customer>(`/customers/${id}`, dto).then((r) => r.data);
export const deleteCustomer = (id: string) => apiClient.delete(`/customers/${id}`);
export const getCustomerSummary = (id: string) => apiClient.get<CustomerSummary>(`/customers/${id}/summary`).then((r) => r.data);

/** أرشفة/إلغاء أرشفة — إخفاء من القوائم اليومية مع البقاء في الحسابات. */
export const setCustomerArchived = (id: string, archived: boolean) => apiClient.patch<Customer>(`/customers/${id}/archive`, { archived }).then((r) => r.data);
