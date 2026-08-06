import { apiClient } from './client';

export interface Bank {
  id: string;
  branchId: string | null;
  name: string;
  iban: string | null;
  balance: string;
  openingBalance: string;
  openingDate: string;
}

export interface BankInput {
  name: string;
  /** Omit for a company-wide record. */
  branchId?: string;
  iban?: string;
  openingBalance?: number;
  openingDate: string;
}

export const listBanks = () => apiClient.get<Bank[]>('/banks').then((r) => r.data);
export const createBank = (dto: BankInput) => apiClient.post<Bank>('/banks', dto).then((r) => r.data);
export const updateBank = (id: string, dto: Partial<BankInput>) => apiClient.patch<Bank>(`/banks/${id}`, dto).then((r) => r.data);
export const deleteBank = (id: string) => apiClient.delete(`/banks/${id}`);
