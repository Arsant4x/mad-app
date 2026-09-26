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

/**
 * ⚖️ **أنواعُ الردّ مولَّدةٌ لا مكتوبةٌ بيد** (`ق-١٤٥٠` · خطّةُ الأنواع ④ — الوحدةُ الثانية بعد الكاشير): الأسماءُ هنا **استعارةٌ** لأصناف
 * الخادم (`apps/api/src/banks/dto/*-responses.dto.ts`)، وصدقُها يشهد به حارسُ الصدق الحيّ على التطبيق المبنيّ (`scripts/response-truth.ts`)
 * — لا هذا الملفّ. **وقِيس المكتوبُ بيدٍ قبل استبداله**: كان إلغاءُ الإيداع يُعلن `drawer` و`bank` ولا يُرسَلان فيه، وكان
 * `journalEntryId` على الإيداع `string` والعمودُ `String?`، وكانت المطابقةُ وفكُّها والترحيلُ من الكشف بلا نوعٍ أصلاً.
 */

/**
 * ⚖️ ق-١٤٣١ — نوعُ الصفّ معلَنٌ لا مستنبَط: «صندوقٌ نقديّ» أو «حسابٌ بنكيّ». و`LEGACY_UNDECLARED` صفٌّ سبق البناءَ
 * ولم يُعلَن — لا يُنقل حتى يُعلَن، ولا يُختار لصفٍّ جديد.
 */
export type { BankKind };
/** ما يُعلَن عند الإنشاء — من جسم الطلب المولَّد (`CreateBankDto.kind`) لا اتّحاداً مكتوباً بيد: «غيرُ معلَن» ليس مدخلاً (`ق-١٤٣١`). */
export type DeclaredBankKind = BankInput['kind'];
export const BANK_KIND_LABEL: Record<BankKind, string> = {
  CASH_BOX: 'صندوقٌ نقديّ',
  BANK_ACCOUNT: 'حسابٌ بنكيّ',
  LEGACY_UNDECLARED: 'غيرُ معلَن',
};

/** صفُّ البنك كما يُرسَل — في القائمة والإنشاء والتعديل والأرشفة. */
export type Bank = BankRowResponse;

/** جسمُ الإنشاء مولَّدٌ من الخادم (③) — والنوعُ فيه إلزاميٌّ بقيمتَيه المعلنتَين (ق-١٤٣١). */
export type BankInput = CreateBankDto;

/**
 * 🔴 `ق-١٣٨٤` — **الفرعُ يُحدَّد عند الإنشاء**: `UpdateBankDto` لا يقبل `branchId` (و`forbidNonWhitelisted` يردّ `400`)،
 * فنوعُ التعديل يمنعه **بالبناء** — `never` لا الإغفال، كي لا يُسلَّم إليه كائنُ إنشاءٍ يحمله (وهكذا كان يُردّ تعديلُ كلِّ حسابٍ له فرع).
 */
export type BankUpdateInput = Partial<Omit<BankInput, 'branchId'>> & { branchId?: never };

// بلا `?page` فالردُّ مصفوفة — والمغلَّفُ المرقَّم لا تطلبه الشاشة.
export const listBanks =(includeArchived = false) => apiClient.get<Bank[]>('/banks', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);

/** سقفُ نطاق رموز الحسابات (ق-٢٩٥) — يُنذر قبل الاصطدام لا عنده؛ والشكلُ نفسُه لنطاق الأدراج. */
export type CodeBandStatus = CodeBandStatusResponse;

export const getBankCodeBand = () => apiClient.get<CodeBandStatus>('/banks/code-band').then((r) => r.data);
export const createBank = (dto: BankInput) => apiClient.post<Bank>('/banks', dto).then((r) => r.data);
export const updateBank = (id: string, dto: BankUpdateInput) => apiClient.patch<Bank>(`/banks/${id}`, dto).then((r) => r.data);
/** `204` بلا جسم — نقلٌ إلى سلّة المحذوفات. */
export const deleteBank = (id: string) => apiClient.delete<void>(`/banks/${id}`);

/** أرشفة/إلغاء أرشفة — إخفاء من القوائم اليومية مع البقاء في الحسابات. */
export const setBankArchived = (id: string, archived: boolean) => apiClient.patch<Bank>(`/banks/${id}/archive`, { archived }).then((r) => r.data);

/** التسويةُ البنكية (`ق-١٢٦١` ج) — كلُّ رقمٍ نصٌّ من الخادم، والمقترَحاتُ من الخادم. */
export type ReconciliationLedgerRow = ReconciliationLedgerRowResponse;
export type ReconciliationOverview = ReconciliationOverviewResponse;
/** سطرُ الكشف كما تعيده المطابقةُ وفكُّها والترحيلُ منه — وكانت الثلاثةُ بلا نوعٍ قبل الوحدة. */
export type BankStatementLine = BankStatementLineResponse;
/** حالُ الإقفال — تاريخُه يوماً، وفراغٌ بعد إعادة الفتح. */
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
 * تأكيدُ إيداعٍ في الطريق من سطر الكشف (⑦A3): الطرفُ المقابل يفرضه الخادم (`1190`) والمبلغُ يجب أن يساوي المستند —
 * فلا طرفَ يُرسَل من هنا.
 */
export const confirmDepositFromStatement = (bankId: string, transactionId: string, depositId: string) =>
  apiClient.post<BankStatementLine>(`/banks/${bankId}/reconciliation/post`, { transactionId, depositId }).then((r) => r.data);
export const closeReconciliation = (bankId: string, until: string) =>
  apiClient.post<ReconciliationState>(`/banks/${bankId}/reconciliation/close`, { until }).then((r) => r.data);
export const reopenReconciliation = (bankId: string) =>
  apiClient.post<ReconciliationState>(`/banks/${bankId}/reconciliation/reopen`).then((r) => r.data);

/** إيداعُ نقدِ الدرج في البنك عبر «نقدٍ في الطريق» `1190` (`ق-١٢٦١` ج — ⑦A3). كلُّ رقمٍ نصٌّ من الخادم. */
export type { CashDepositStatus };
/** الإيداعُ في القائمة وعند إنشائه — بالدرج والبنك مسمّيَين؛ و`journalEntryId` فارغٌ حيث يقبله العمود. */
export type CashDeposit = CashDepositResponse;
/** الإيداعاتُ ومجموعُ `1190` بالدفتر مقابل المستندات المفتوحة — والفرقُ يُعلَن لا يُصحَّح. */
export type CashDepositList = CashDepositListResponse;
export type CashDepositInput = CreateCashDepositDto;
export const listCashDeposits = (bankId?: string) =>
  apiClient.get<CashDepositList>('/banks/cash-deposits', { params: bankId ? { bankId } : undefined }).then((r) => r.data);
export const createCashDeposit = (dto: CashDepositInput) =>
  apiClient.post<CreatedCashDepositResponse>('/banks/cash-deposits', dto).then((r) => r.data);
/** الإلغاءُ يعيد أعمدةَ المستند ورقمَ قيد العكس — **بلا الدرج والبنك** (كان النوعُ المكتوبُ بيدٍ يعلنهما). */
export const voidCashDeposit = (id: string, reason?: string) =>
  apiClient.post<VoidedCashDepositResponse>(`/banks/cash-deposits/${id}/void`, { reason }).then((r) => r.data);

/** تسويةُ الشبكة `1251` (`ق-١٢٦١` ج — ⑦A2): الإجماليُّ من السندات، والصافي إلى البنك؛ كلُّ رقمٍ نصٌّ من الخادم. */
export type { NetworkSettlementStatus };
export type NetworkSettlement = NetworkSettlementResponse;
/** رصيدُ `1251` بالدفتر مقابل مجموع السندات المفتوحة — والفرقُ يُعلَن لا يُصحَّح. */
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
