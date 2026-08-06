import type { Bank } from './banks';
import { apiClient } from './client';

export interface BankTx {
  id: string;
  branchId: string | null;
  bankId: string;
  bank: Bank;
  date: string;
  description: string;
  amount: string;
  source: string | null;
  matched: boolean;
  entryNo: string | null;
}

export interface TransactionInput {
  bankId: string;
  /** Omit for a company-wide record. */
  branchId?: string;
  date: string;
  description: string;
  amount: number;
  source?: string;
}

export const listTransactions = () => apiClient.get<BankTx[]>('/transactions').then((r) => r.data);
export const createTransaction = (dto: TransactionInput) => apiClient.post<BankTx>('/transactions', dto).then((r) => r.data);
export const updateTransaction = (id: string, dto: Partial<TransactionInput>) => apiClient.patch<BankTx>(`/transactions/${id}`, dto).then((r) => r.data);
export const deleteTransaction = (id: string) => apiClient.delete(`/transactions/${id}`);
