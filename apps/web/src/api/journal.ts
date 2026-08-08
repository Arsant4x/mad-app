import { apiClient } from './client';
import type { Account } from './accounts';

export interface JournalLine {
  id: string;
  accountId: string;
  account: Account;
  debit: string;
  credit: string;
}

export interface JournalEntry {
  id: string;
  no: string;
  date: string;
  memo: string;
  totalDebit: string;
  totalCredit: string;
  auto: boolean;
  lines: JournalLine[];
}

export interface JournalLineInput {
  accountId: string;
  debit: number;
  credit: number;
}

export interface CreateJournalEntryInput {
  date: string;
  memo: string;
  lines: JournalLineInput[];
}

export interface JournalListResponse {
  items: JournalEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListJournalParams {
  page?: number;
  pageSize?: number;
  /** Server-side — matches memo, entry no, or a line's account code. */
  search?: string;
}

export const listJournalEntries = (params: ListJournalParams = {}) =>
  apiClient.get<JournalListResponse>('/journal', { params }).then((r) => r.data);
export const createJournalEntry = (dto: CreateJournalEntryInput) => apiClient.post<JournalEntry>('/journal', dto).then((r) => r.data);
export const deleteJournalEntry = (id: string) => apiClient.delete(`/journal/${id}`);
