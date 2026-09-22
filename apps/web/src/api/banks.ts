import { apiClient } from './client';

export interface Bank {
  archived: boolean;
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

export const listBanks = (includeArchived = false) => apiClient.get<Bank[]>('/banks', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);

/** سقفُ نطاق رموز الحسابات (ق-٢٩٥) — يُنذر قبل الاصطدام لا عنده. */
export interface CodeBandStatus {
  key: string;
  name: string;
  capacity: number;
  remaining: number;
  next: string | null;
  warnThreshold: number;
  warn: boolean;
}

export const getBankCodeBand = () => apiClient.get<CodeBandStatus>('/banks/code-band').then((r) => r.data);
export const createBank = (dto: BankInput) => apiClient.post<Bank>('/banks', dto).then((r) => r.data);
export const updateBank = (id: string, dto: Partial<BankInput>) => apiClient.patch<Bank>(`/banks/${id}`, dto).then((r) => r.data);
export const deleteBank = (id: string) => apiClient.delete(`/banks/${id}`);

/** أرشفة/إلغاء أرشفة — إخفاء من القوائم اليومية مع البقاء في الحسابات. */
export const setBankArchived = (id: string, archived: boolean) => apiClient.patch<Bank>(`/banks/${id}/archive`, { archived }).then((r) => r.data);

/** التسويةُ البنكية (`ق-١٢٦١` ج) — كلُّ رقمٍ نصٌّ من الخادم، والمقترَحاتُ من الخادم. */
export interface ReconciliationLedgerRow {
  lineId: string;
  entryId: string;
  entryNo: string;
  date: string;
  memo: string;
  debit: string;
  credit: string;
  balance: string;
  source: { type: string; id: string; no: string };
  matched: boolean;
}
export interface ReconciliationOverview {
  bank: { id: string; name: string; accountId: string; reconciledUntil: string | null; mirrorBalance: string };
  from: string | null;
  to: string | null;
  statement: { id: string; date: string; description: string; amount: string; matchedLineId: string | null; matchedAt: string | null; source: string | null }[];
  ledger: { opening: string; closing: string; rows: ReconciliationLedgerRow[]; truncated: boolean };
  suggestions: { transactionId: string; lineIds: string[] }[];
  totals: { unmatchedStatement: string; unmatchedStatementCount: number; unmatchedLedger: string; unmatchedLedgerCount: number };
}
export const getReconciliation = (bankId: string, params: { from?: string; to?: string }) =>
  apiClient.get<ReconciliationOverview>(`/banks/${bankId}/reconciliation`, { params }).then((r) => r.data);
export const matchStatementLine = (bankId: string, transactionId: string, lineId: string) =>
  apiClient.post(`/banks/${bankId}/reconciliation/match`, { transactionId, lineId }).then((r) => r.data);
export const unmatchStatementLine = (bankId: string, transactionId: string) =>
  apiClient.post(`/banks/${bankId}/reconciliation/unmatch`, { transactionId }).then((r) => r.data);
export const postStatementLine = (bankId: string, transactionId: string, counterpartyAccountId: string, memo?: string) =>
  apiClient.post(`/banks/${bankId}/reconciliation/post`, { transactionId, counterpartyAccountId, memo }).then((r) => r.data);
export const closeReconciliation = (bankId: string, until: string) =>
  apiClient.post<{ bankId: string; reconciledUntil: string | null }>(`/banks/${bankId}/reconciliation/close`, { until }).then((r) => r.data);
export const reopenReconciliation = (bankId: string) =>
  apiClient.post<{ bankId: string; reconciledUntil: string | null }>(`/banks/${bankId}/reconciliation/reopen`).then((r) => r.data);
