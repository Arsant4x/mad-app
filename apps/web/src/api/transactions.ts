import type { Bank } from './banks';
import { apiClient } from './client';
import type { CreateTransactionDto } from '@mad-app/shared/api/requests';

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

export type TransactionInput = CreateTransactionDto;

export interface BankTxListResponse {
  items: BankTx[];
  total: number;
  page: number;
  pageSize: number;
}

export const listTransactions = (params: { page?: number; pageSize?: number; search?: string } = {}) =>
  apiClient.get<BankTxListResponse>('/transactions', { params }).then((r) => r.data);
export const createTransaction = (dto: TransactionInput) => apiClient.post<BankTx>('/transactions', dto).then((r) => r.data);
export const updateTransaction = (id: string, dto: Partial<TransactionInput>) => apiClient.patch<BankTx>(`/transactions/${id}`, dto).then((r) => r.data);
export const deleteTransaction = (id: string) => apiClient.delete(`/transactions/${id}`);
