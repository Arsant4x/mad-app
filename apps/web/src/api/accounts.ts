import type { MoneyText } from '../lib/money';
import { apiClient } from './client';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  openingBalance: string;
  /** تاريخُ الافتتاح (ق-٢٩٦) — يُشتقّ من القيد حين لم يُعلَن. */
  openingDate: string | null;
  /** `false` = مشتقٌّ من الأستاذ، `true` = أعلنه التاجر. */
  openingDateDeclared: boolean;
  balance: string;
}

export interface AccountInput {
  code: string;
  name: string;
  type: AccountType;
  openingBalance?: number;
  openingDate?: string;
}

export const listAccounts = () => apiClient.get<Account[]>('/accounts').then((r) => r.data);

/** مجموعُ أرصدة الدليل لكل نوع — من الخادم (`GET /accounts/summary`) لا من جمع الشاشة (`ق-١٢٤٣`)؛ نصٌّ بخانتين. */
export type AccountsSummary = Record<AccountType, { total: MoneyText; count: number }>;
export const getAccountsSummary = () => apiClient.get<AccountsSummary>('/accounts/summary').then((r) => r.data);
export const createAccount = (dto: AccountInput) => apiClient.post<Account>('/accounts', dto).then((r) => r.data);
export const updateAccount = (id: string, dto: Partial<Omit<AccountInput, 'code'>>) => apiClient.patch<Account>(`/accounts/${id}`, dto).then((r) => r.data);
export const deleteAccount = (id: string) => apiClient.delete(`/accounts/${id}`);
