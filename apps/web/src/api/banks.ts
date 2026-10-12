import { apiClient } from './client';
import type { BankKind, CashDepositStatus, NetworkSettlementStatus } from '@mad-app/shared/api/enums';
import type { CreateBankDto, CreateCashDepositDto, CreateNetworkSettlementDto } from '@mad-app/shared/api/requests';
import type {
  BankRowResponse,
  BankStatementLineResponse,
  CashDepositListResponse,
  CashDepositResponse,
  CodeBandStatusResponse,
  CreatedCashDepositResponse,
  CreatedNetworkSettlementResponse,
  NetworkSettlementListResponse,
  NetworkSettlementResponse,
  NetworkTransitSummaryResponse,
  OpenNetworkReceiptsResponse,
  ReconciliationLedgerRowResponse,
  ReconciliationOverviewResponse,
  ReconciliationStateResponse,
  VoidedCashDepositResponse,
  VoidedNetworkSettlementResponse,
} from '@mad-app/shared/api/responses';
import { labelTable } from '../lib/labelTable';

/**
 * Response types are generated from the server's response classes (`apps/api/src/banks/dto/*-responses.dto.ts`),
 * not written by hand; their truth is checked against the built app by `scripts/response-truth.ts`.
 */

/**
 * The row kind is declared, never inferred: a cash box or a bank account. `LEGACY_UNDECLARED` is a row
 * from before the field existed; it is not moved until declared and is never chosen for a new row.
 */
export type { BankKind };
/** What is declared on create, from the generated request body: "not declared" is not an input. */
export type DeclaredBankKind = BankInput['kind'];
export const BANK_KIND_LABEL: Record<BankKind, string> = labelTable('labels.bank_kinds', ['CASH_BOX', 'BANK_ACCOUNT', 'LEGACY_UNDECLARED']);

/** A bank row as sent in the list, create, update and archive answers. */
export type Bank = BankRowResponse;

/** The create body, generated from the server; the kind is required with its two declared values. */
export type BankInput = CreateBankDto;

/**
 * The branch is set on create: `UpdateBankDto` does not accept `branchId` and the server answers `400`.
 * `never` (not an omitted field) stops a create object carrying it from being passed here.
 */
export type BankUpdateInput = Partial<Omit<BankInput, 'branchId'>> & { branchId?: never };

// Without `?page` the answer is a plain array; the screen does not need the paginated envelope.
export const listBanks =(includeArchived = false) => apiClient.get<Bank[]>('/banks', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);

/** The account code band ceiling: warns before a collision, not at it. Same shape as the drawer band. */
export type CodeBandStatus = CodeBandStatusResponse;

export const getBankCodeBand = () => apiClient.get<CodeBandStatus>('/banks/code-band').then((r) => r.data);
export const createBank = (dto: BankInput) => apiClient.post<Bank>('/banks', dto).then((r) => r.data);
export const updateBank = (id: string, dto: BankUpdateInput) => apiClient.patch<Bank>(`/banks/${id}`, dto).then((r) => r.data);
/** `204` with no body: moved to the trash. */
export const deleteBank = (id: string) => apiClient.delete<void>(`/banks/${id}`);

/** Archive or unarchive: hidden from daily lists while staying in the accounts. */
export const setBankArchived = (id: string, archived: boolean) => apiClient.patch<Bank>(`/banks/${id}/archive`, { archived }).then((r) => r.data);

/** Bank reconciliation: every amount is text from the server, and the suggestions come from the server. */
export type ReconciliationLedgerRow = ReconciliationLedgerRowResponse;
export type ReconciliationOverview = ReconciliationOverviewResponse;
/** A statement line as returned by match, unmatch and post. */
export type BankStatementLine = BankStatementLineResponse;
/** Close state: the date as a day, and empty after reopening. */
export type ReconciliationState = ReconciliationStateResponse;
export const getReconciliation = (bankId: string, params: { from?: string; to?: string }) =>
  apiClient.get<ReconciliationOverview>(`/banks/${bankId}/reconciliation`, { params }).then((r) => r.data);
export const matchStatementLine = (bankId: string, transactionId: string, lineId: string) =>
  apiClient.post<BankStatementLine>(`/banks/${bankId}/reconciliation/match`, { transactionId, lineId }).then((r) => r.data);
export const unmatchStatementLine = (bankId: string, transactionId: string) =>
  apiClient.post<BankStatementLine>(`/banks/${bankId}/reconciliation/unmatch`, { transactionId }).then((r) => r.data);
export const postStatementLine = (bankId: string, transactionId: string, counterpartyAccountId: string, memo?: string) =>
  apiClient.post<BankStatementLine>(`/banks/${bankId}/reconciliation/post`, { transactionId, counterpartyAccountId, memo }).then((r) => r.data);
/**
 * Confirms a deposit in transit from a statement line: the server sets the counter account (`1190`) and
 * the amount must equal the document, so no counter account is sent from here.
 */
export const confirmDepositFromStatement = (bankId: string, transactionId: string, depositId: string) =>
  apiClient.post<BankStatementLine>(`/banks/${bankId}/reconciliation/post`, { transactionId, depositId }).then((r) => r.data);
export const closeReconciliation = (bankId: string, until: string) =>
  apiClient.post<ReconciliationState>(`/banks/${bankId}/reconciliation/close`, { until }).then((r) => r.data);
export const reopenReconciliation = (bankId: string) =>
  apiClient.post<ReconciliationState>(`/banks/${bankId}/reconciliation/reopen`).then((r) => r.data);

/** Depositing drawer cash in the bank through "cash in transit" `1190`. Every amount is text from the server. */
export type { CashDepositStatus };
/** A deposit in the list and on create, with its drawer and bank named; `journalEntryId` is empty where the column allows. */
export type CashDeposit = CashDepositResponse;
/** Deposits and the `1190` ledger total against open documents; a difference is shown, not corrected. */
export type CashDepositList = CashDepositListResponse;
export type CashDepositInput = CreateCashDepositDto;
export const listCashDeposits = (bankId?: string) =>
  apiClient.get<CashDepositList>('/banks/cash-deposits', { params: bankId ? { bankId } : undefined }).then((r) => r.data);
export const createCashDeposit = (dto: CashDepositInput) =>
  apiClient.post<CreatedCashDepositResponse>('/banks/cash-deposits', dto).then((r) => r.data);
/** Voiding returns the document columns and the reversal entry number, without the drawer and bank. */
export const voidCashDeposit = (id: string, reason?: string) =>
  apiClient.post<VoidedCashDepositResponse>(`/banks/cash-deposits/${id}/void`, { reason }).then((r) => r.data);

/** Card network settlement `1251`: the gross from the receipts, the net to the bank; every amount is text from the server. */
export type { NetworkSettlementStatus };
export type NetworkSettlement = NetworkSettlementResponse;
/** The `1251` ledger balance against open receipts; a difference is shown, not corrected. */
export type NetworkTransitSummary = NetworkTransitSummaryResponse;
export type NetworkSettlementList = NetworkSettlementListResponse;
export type OpenNetworkReceipts = OpenNetworkReceiptsResponse;
export type NetworkSettlementInput = CreateNetworkSettlementDto;
export const listNetworkSettlements = (bankId?: string) =>
  apiClient.get<NetworkSettlementList>('/banks/network-settlements', { params: bankId ? { bankId } : undefined }).then((r) => r.data);
export const getOpenNetworkReceipts = (params: { from?: string; to?: string; branchId?: string }) =>
  apiClient.get<OpenNetworkReceipts>('/banks/network-settlements/open', { params }).then((r) => r.data);
export const createNetworkSettlement = (dto: NetworkSettlementInput) =>
  apiClient.post<CreatedNetworkSettlementResponse>('/banks/network-settlements', dto).then((r) => r.data);
export const voidNetworkSettlement = (id: string, reason?: string) =>
  apiClient.post<VoidedNetworkSettlementResponse>(`/banks/network-settlements/${id}/void`, { reason }).then((r) => r.data);
