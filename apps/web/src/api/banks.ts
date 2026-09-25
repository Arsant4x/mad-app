import { apiClient } from './client';
import type { BankKind, CashDepositStatus, NetworkSettlementStatus } from '@mad-app/shared/api/enums';
import type { CreateBankDto, CreateCashDepositDto, CreateNetworkSettlementDto } from '@mad-app/shared/api/requests';

/**
 * ⚖️ ق-١٤٣١ — نوعُ الصفّ معلَنٌ لا مستنبَط: «صندوقٌ نقديّ» أو «حسابٌ بنكيّ». و`LEGACY_UNDECLARED` صفٌّ سبق البناءَ
 * ولم يُعلَن — لا يُنقل حتى يُعلَن، ولا يُختار لصفٍّ جديد.
 */
export type { BankKind };
/** ما يُختار لصفٍّ جديدٍ أو يُعلَن به القائم — القديمُ غيرُ المعلَن ليس خياراً. */
export type DeclaredBankKind = Exclude<BankKind, 'LEGACY_UNDECLARED'>;
export const BANK_KIND_LABEL: Record<BankKind, string> = {
  CASH_BOX: 'صندوقٌ نقديّ',
  BANK_ACCOUNT: 'حسابٌ بنكيّ',
  LEGACY_UNDECLARED: 'غيرُ معلَن',
};

export interface Bank {
  archived: boolean;
  id: string;
  branchId: string | null;
  kind: BankKind;
  name: string;
  iban: string | null;
  balance: string;
  openingBalance: string;
  openingDate: string;
}

/** جسمُ الإنشاء مولَّدٌ من الخادم (③) — والنوعُ فيه إلزاميٌّ بقيمتَيه المعلنتَين (ق-١٤٣١). */
export type BankInput = CreateBankDto;

/**
 * 🔴 `ق-١٣٨٤` — **الفرعُ يُحدَّد عند الإنشاء**: `UpdateBankDto` لا يقبل `branchId` (و`forbidNonWhitelisted` يردّ `400`)،
 * فنوعُ التعديل يمنعه **بالبناء** — `never` لا الإغفال، كي لا يُسلَّم إليه كائنُ إنشاءٍ يحمله (وهكذا كان يُردّ تعديلُ كلِّ حسابٍ له فرع).
 */
export type BankUpdateInput = Partial<Omit<BankInput, 'branchId'>> & { branchId?: never };

export const listBanks =(includeArchived = false) => apiClient.get<Bank[]>('/banks', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);

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
export const updateBank = (id: string, dto: BankUpdateInput) => apiClient.patch<Bank>(`/banks/${id}`, dto).then((r) => r.data);
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
/**
 * تأكيدُ إيداعٍ في الطريق من سطر الكشف (⑦A3): الطرفُ المقابل يفرضه الخادم (`1190`) والمبلغُ يجب أن يساوي المستند —
 * فلا طرفَ يُرسَل من هنا.
 */
export const confirmDepositFromStatement = (bankId: string, transactionId: string, depositId: string) =>
  apiClient.post(`/banks/${bankId}/reconciliation/post`, { transactionId, depositId }).then((r) => r.data);
export const closeReconciliation = (bankId: string, until: string) =>
  apiClient.post<{ bankId: string; reconciledUntil: string | null }>(`/banks/${bankId}/reconciliation/close`, { until }).then((r) => r.data);
export const reopenReconciliation = (bankId: string) =>
  apiClient.post<{ bankId: string; reconciledUntil: string | null }>(`/banks/${bankId}/reconciliation/reopen`).then((r) => r.data);

/** إيداعُ نقدِ الدرج في البنك عبر «نقدٍ في الطريق» `1190` (`ق-١٢٦١` ج — ⑦A3). كلُّ رقمٍ نصٌّ من الخادم. */
export type { CashDepositStatus };
export interface CashDeposit {
  id: string;
  no: string;
  date: string;
  amount: string;
  memo: string | null;
  status: CashDepositStatus;
  drawer: { id: string; name: string };
  bank: { id: string; name: string };
  branchId: string | null;
  journalEntryId: string;
  voidJournalEntryId: string | null;
  confirmedTransactionId: string | null;
  confirmedAt: string | null;
}
export interface CashDepositList {
  items: CashDeposit[];
  /** رصيدُ `1190` بالدفتر مقابل مجموع المستندات المفتوحة — والفرقُ يُعلَن لا يُصحَّح. */
  inTransit: { ledger: string; documents: string; matched: boolean };
}
export type CashDepositInput = CreateCashDepositDto;
export const listCashDeposits = (bankId?: string) =>
  apiClient.get<CashDepositList>('/banks/cash-deposits', { params: bankId ? { bankId } : undefined }).then((r) => r.data);
export const createCashDeposit = (dto: CashDepositInput) =>
  apiClient.post<CashDeposit & { entryNo: string }>('/banks/cash-deposits', dto).then((r) => r.data);
export const voidCashDeposit = (id: string, reason?: string) =>
  apiClient.post<CashDeposit & { voidEntryNo: string }>(`/banks/cash-deposits/${id}/void`, { reason }).then((r) => r.data);

/** تسويةُ الشبكة `1251` (`ق-١٢٦١` ج — ⑦A2): الإجماليُّ من السندات، والصافي إلى البنك؛ كلُّ رقمٍ نصٌّ من الخادم. */
export type { NetworkSettlementStatus };
export interface NetworkSettlement {
  id: string;
  no: string;
  date: string;
  periodFrom: string;
  periodTo: string;
  grossAmount: string;
  feeAmount: string;
  feeVatAmount: string;
  netAmount: string;
  memo: string | null;
  status: NetworkSettlementStatus;
  branchId: string | null;
  bankId: string;
  bank: { id: string; name: string };
  journalEntryId: string | null;
  voidJournalEntryId: string | null;
  receiptCount: number;
}
/** رصيدُ `1251` بالدفتر مقابل مجموع السندات المفتوحة — والفرقُ يُعلَن لا يُصحَّح. */
export interface NetworkTransitSummary {
  ledger: string;
  open: string;
  openCount: number;
  matched: boolean;
}
export interface NetworkSettlementList {
  items: NetworkSettlement[];
  summary: NetworkTransitSummary;
}
export interface OpenNetworkReceipts {
  receipts: { id: string; no: string; date: string; branchId: string | null; customerName: string; signed: string }[];
  gross: string;
  summary: NetworkTransitSummary;
}
export type NetworkSettlementInput = CreateNetworkSettlementDto;
export const listNetworkSettlements = (bankId?: string) =>
  apiClient.get<NetworkSettlementList>('/banks/network-settlements', { params: bankId ? { bankId } : undefined }).then((r) => r.data);
export const getOpenNetworkReceipts = (params: { from?: string; to?: string; branchId?: string }) =>
  apiClient.get<OpenNetworkReceipts>('/banks/network-settlements/open', { params }).then((r) => r.data);
export const createNetworkSettlement = (dto: NetworkSettlementInput) =>
  apiClient.post<NetworkSettlement & { entryNo: string }>('/banks/network-settlements', dto).then((r) => r.data);
export const voidNetworkSettlement = (id: string, reason?: string) =>
  apiClient.post<NetworkSettlement & { voidEntryNo: string }>(`/banks/network-settlements/${id}/void`, { reason }).then((r) => r.data);
