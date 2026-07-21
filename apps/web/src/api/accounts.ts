import { apiClient } from './client';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  openingBalance: string;
  balance: string;
}

export interface AccountInput {
  code: string;
  name: string;
  type: AccountType;
  openingBalance?: number;
}

export const listAccounts = () => apiClient.get<Account[]>('/accounts').then((r) => r.data);
export const createAccount = (dto: AccountInput) => apiClient.post<Account>('/accounts', dto).then((r) => r.data);
export const updateAccount = (id: string, dto: Partial<Omit<AccountInput, 'code'>>) => apiClient.patch<Account>(`/accounts/${id}`, dto).then((r) => r.data);
export const deleteAccount = (id: string) => apiClient.delete(`/accounts/${id}`);
