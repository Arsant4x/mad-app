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

export const listJournalEntries = () => apiClient.get<JournalEntry[]>('/journal').then((r) => r.data);
export const createJournalEntry = (dto: CreateJournalEntryInput) => apiClient.post<JournalEntry>('/journal', dto).then((r) => r.data);
export const deleteJournalEntry = (id: string) => apiClient.delete(`/journal/${id}`);
