import { apiClient } from './client';
import type { Account } from './accounts';
import type { CreateJournalEntryDto, JournalLineDto, JournalListQuery } from '@mad-app/shared/api/requests';

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
  /** ⚖️ القيدُ المرحَّل يُعكس ولا يُحذف (ق-١٢٥٣): مَن عكسه، أو مَن يعكسه هذا القيد. */
  reversedBy: { id: string; no: string; date: string } | null;
  reversalOf: { id: string; no: string } | null;
}

export type JournalLineInput = JournalLineDto;

export type CreateJournalEntryInput = CreateJournalEntryDto;

export interface JournalListResponse {
  items: JournalEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export type ListJournalParams = JournalListQuery;

export const listJournalEntries = (params: ListJournalParams = {}) =>
  apiClient.get<JournalListResponse>('/journal', { params }).then((r) => r.data);
export const createJournalEntry = (dto: CreateJournalEntryInput) => apiClient.post<JournalEntry>('/journal', dto).then((r) => r.data);
/** قيدٌ عكسيٌّ مرقَّمٌ بتاريخ اليوم (أو تاريخٍ يُمرَّر) في فترةٍ مفتوحة — والأصلُ يبقى. */
export const reverseJournalEntry = (id: string, body: { date?: string; memo?: string } = {}) =>
  apiClient.post<JournalEntry>(`/journal/${id}/reverse`, body).then((r) => r.data);
