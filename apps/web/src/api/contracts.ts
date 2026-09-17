import { apiClient } from './client';
import type { Unit } from './units';

export type ContractStatus = 'DRAFT' | 'UPCOMING' | 'DUE' | 'LATE' | 'CANCELLED';
export type ContractCycle = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
export type Furnished = 'unfurnished' | 'furnished' | 'partial';
/** تصنيفُ العقد للضريبة — على العقد لا العقار ولا الوحدة (ق-٨٩١)؛ والقيمةُ القديمة للصفوف
 * التي سبقت الهجرة وحدَها، ولا يقبلها الخادمُ لعقدٍ جديد. */
export type ContractClassification = 'RESIDENTIAL' | 'COMMERCIAL' | 'LEGACY_UNCLASSIFIED';
/** أقيمةُ العقد شاملةٌ لضريبة القيمة المضافة أم لا — تُعلَن ولا تُفترض (ق-٨٩٢). */
export type ContractVatInclusion = 'INCLUSIVE' | 'EXCLUSIVE' | 'LEGACY_UNDECLARED';
export type DeclaredClassification = Exclude<ContractClassification, 'LEGACY_UNCLASSIFIED'>;
export type DeclaredVatInclusion = Exclude<ContractVatInclusion, 'LEGACY_UNDECLARED'>;
/** منسوخٌ بيدٍ من `InstallmentStatus` في المخطّط (دَينُ 4.5) — `PARTIAL` مسدَّدٌ بعضُه، تُشتقّ من المقبوض مقابل الإجماليّ (ق-١٠٤٠). */
export type InstallmentStatus = 'DUE' | 'LATE' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'BANK';

export interface Installment {
  id: string;
  dueDate: string;
  amount: string;
  status: InstallmentStatus;
  notes: string | null;
}

export interface RentPayment {
  id: string;
  installmentId: string | null;
  date: string;
  amount: string;
  discount: string;
  netAmount: string;
  method: PaymentMethod;
  bankId: string | null;
  notes: string | null;
  journalEntryId: string | null;
}

export interface Contract {
  id: string;
  unitId: string;
  unit: Unit & { property: { id: string; name: string } };
  customerId: string | null;
  /** بطاقةُ العميل — مصدرُ الحقيقة؛ `tenant`/`phone` أدناه مشتقّان منها عند القراءة (ق-١٠٢٨/①⑥). */
  customer?: { id: string; name: string; phone: string | null; archived: boolean } | null;
  no: string;
  ejarNo: string | null;
  tenant: string;
  phone: string | null;
  value: string;
  cycle: ContractCycle;
  start: string;
  end: string;
  deposit: string;
  services: string | null;
  furnished: Furnished | null;
  classification: ContractClassification;
  vatInclusion: ContractVatInclusion;
  status: ContractStatus;
  cancelDate: string | null;
  cancelReason: string | null;
  /** What the tenant owes for terminating early — compensation, posted to other
   * income rather than rent. Null when the parties agreed on nothing. */
  settlementAmount: string | null;
  settlementEntryId: string | null;
  /** The contract this one renews, if any — set on the renewal, not the source. */
  renewedFromId: string | null;
  installments: Installment[];
  payments: RentPayment[];
  deposits: ContractDeposit[];
  claims: ContractClaim[];
  keyMoney: ContractKeyMoney[];
  handovers: ContractHandover[];
}

export type HandoverType = 'DELIVERY' | 'RECEIPT';
export type HandoverStatus = 'DRAFT' | 'SIGNED';
export type ItemCondition = 'GOOD' | 'FAIR' | 'DAMAGED' | 'MISSING';

export interface HandoverItem {
  id: string;
  label: string;
  condition: ItemCondition;
  note: string | null;
}

export interface ContractHandover {
  id: string;
  type: HandoverType;
  status: HandoverStatus;
  date: string;
  electricityMeter: string | null;
  waterMeter: string | null;
  notes: string | null;
  /** Server-stamped at signing — never supplied by the client. */
  signedAt: string | null;
  signedBy: string | null;
  items: HandoverItem[];
}

export interface HandoverItemInput {
  label: string;
  condition: ItemCondition;
  note?: string;
}

export interface CreateHandoverInput {
  type: HandoverType;
  date: string;
  electricityMeter?: string;
  waterMeter?: string;
  notes?: string;
  items: HandoverItemInput[];
}

export interface UpdateHandoverInput {
  date?: string;
  electricityMeter?: string;
  waterMeter?: string;
  notes?: string;
  /** Replaces the list wholesale. */
  items?: HandoverItemInput[];
}

/** Which way the key money went — it decides the accounting, not just the
 * label: received is income, paid is an asset the company bought. */
export type KeyMoneyDirection = 'RECEIVED' | 'PAID';

export interface ContractKeyMoney {
  id: string;
  direction: KeyMoneyDirection;
  amount: string;
  note: string | null;
  currency: string;
  paidAt: string;
  journalEntryId: string | null;
}

export interface RecordKeyMoneyInput {
  direction: KeyMoneyDirection;
  amount: number;
  paidAt: string;
  note?: string;
}

export type ClaimKind = 'MAINTENANCE' | 'UTILITIES' | 'LATE_FEE' | 'DAMAGE' | 'OTHER';
export type ClaimStatus = 'OPEN' | 'PAID' | 'WAIVED';

export interface ContractClaim {
  id: string;
  kind: ClaimKind;
  amount: string;
  description: string;
  currency: string;
  issuedAt: string;
  status: ClaimStatus;
  settledAt: string | null;
  waiveReason: string | null;
  journalEntryId: string | null;
  settlementEntryId: string | null;
}

export interface CreateClaimInput {
  kind: ClaimKind;
  amount: number;
  description: string;
  issuedAt: string;
}

export type DepositType = 'RENT' | 'FACILITY';
/** Who is holding the money. EJAR means the platform blocked it and the
 * company never received it — nothing is posted to the ledger. */
export type DepositHolder = 'COMPANY' | 'EJAR';
export type DepositStatus = 'HELD' | 'SETTLED';
export type DeductionKind = 'UNPAID_RENT' | 'DAMAGE' | 'UTILITIES' | 'CLEANING' | 'OTHER';

export interface DepositDeduction {
  id: string;
  kind: DeductionKind;
  amount: string;
  reason: string;
}

export interface ContractDeposit {
  id: string;
  type: DepositType;
  holder: DepositHolder;
  amount: string;
  currency: string;
  receivedAt: string;
  status: DepositStatus;
  settledAt: string | null;
  refundAmount: string | null;
  note: string | null;
  /** Null for an Ejar-held deposit, and for a company deposit recorded before
   * the ledger accounts existed. */
  journalEntryId: string | null;
  settlementEntryId: string | null;
  deductions: DepositDeduction[];
}

export interface RecordDepositInput {
  type: DepositType;
  holder?: DepositHolder;
  amount: number;
  receivedAt: string;
  note?: string;
}

export interface SettleDepositInput {
  settledAt: string;
  deductions: { kind: DeductionKind; amount: number; reason: string }[];
}

export interface CreateContractInput {
  unitId: string;
  /** المستأجرُ عميلٌ يُختار بمعرّفه — لا اسمٌ ولا هاتفٌ يُرسَلان (ق-١٠٢٨/①). */
  customerId: string;
  value: number;
  cycle: ContractCycle;
  start: string;
  end: string;
  deposit?: number;
  services?: string;
  furnished?: Furnished;
  ejarNo?: string;
  /** إلزاميان — بلا قيمةٍ مسبقة في النموذج. */
  classification: DeclaredClassification;
  vatInclusion: DeclaredVatInclusion;
  draft?: boolean;
}

export interface UpdateContractInput {
  /** لعقدٍ قديم: إلزاميان قبل أي تعديل — الخادمُ يرفض بدونهما. */
  classification?: DeclaredClassification;
  vatInclusion?: DeclaredVatInclusion;
  /** تغييرُ الطرف بمعرّفه — قبل أوّل ترحيلٍ فقط، والخادمُ يرفض بعده برسالةٍ تسمّي المخرج (ق-١٠٢٨/③). */
  customerId?: string;
  services?: string;
  furnished?: Furnished;
  ejarNo?: string;
}

/** How the early-termination settlement is worked out. The last two are
 * conveniences that compute an amount from the remaining installments. */
export type SettlementBasis = 'none' | 'amount' | 'installments' | 'all';

export interface CancelContractInput {
  cancelDate: string;
  cancelReason: string;
  installmentDisposition: 'keep' | 'cancel';
  /** تفصيل التسوية بنوداً — مجموعها يجب أن يساوي المبلغ، والخادم يدقّق. */
  settlementLines?: { label: string; amount: number }[];
  settlementBasis?: SettlementBasis;
  settlementAmount?: number;
  settlementInstallments?: number;
}

export interface RecordPaymentInput {
  installmentId?: string;
  date: string;
  amount: number;
  discount?: number;
  method: PaymentMethod;
  bankId?: string;
  notes?: string;
}

/** One row of the paginated list — the contract itself plus its unit, without
 * the sub-tree (installments, payments, deposits, …). The list endpoint went
 * on a diet after the full shape blew the server's transaction timeout at
 * ~1,300 contracts; the detail modal fetches the full Contract by id. */
export type ContractListItem = Omit<Contract, 'installments' | 'payments' | 'deposits' | 'claims' | 'keyMoney' | 'handovers'>;

export interface ContractListResponse {
  items: ContractListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListContractsParams {
  page?: number;
  pageSize?: number;
  /** Server-side — matches tenant name, contract no, or unit no. */
  search?: string;
}

export const listContracts = (params: ListContractsParams = {}) =>
  apiClient.get<ContractListResponse>('/contracts', { params }).then((r) => r.data);
export const getContract = (id: string) => apiClient.get<Contract>(`/contracts/${id}`).then((r) => r.data);
export const createContract = (dto: CreateContractInput) => apiClient.post<Contract>('/contracts', dto).then((r) => r.data);
export const updateContract = (id: string, dto: UpdateContractInput) => apiClient.patch<Contract>(`/contracts/${id}`, dto).then((r) => r.data);
export const cancelContract = (id: string, dto: CancelContractInput) => apiClient.post<Contract>(`/contracts/${id}/cancel`, dto).then((r) => r.data);
export const recordPayment = (contractId: string, dto: RecordPaymentInput) => apiClient.post<RentPayment>(`/contracts/${contractId}/payments`, dto).then((r) => r.data);
export interface RenewContractInput {
  start: string;
  end: string;
  /** يُعلَنان للعقد الجديد — لا يرثهما الخادمُ من الأصل. */
  classification: DeclaredClassification;
  vatInclusion: DeclaredVatInclusion;
  value?: number;
  cycle?: ContractCycle;
  /** Overrides the server's own numbering, for externally-issued references. */
  no?: string;
  ejarNo?: string;
  /** Defaults to true server-side: a held deposit moves to the new lease. */
  carryDeposits?: boolean;
}

export const renewContract = (id: string, dto: RenewContractInput) =>
  apiClient.post<Contract>(`/contracts/${id}/renew`, dto).then((r) => r.data);

export const createHandover = (contractId: string, dto: CreateHandoverInput) =>
  apiClient.post<Contract>(`/contracts/${contractId}/handovers`, dto).then((r) => r.data);
export const updateHandover = (contractId: string, handoverId: string, dto: UpdateHandoverInput) =>
  apiClient.patch<Contract>(`/contracts/${contractId}/handovers/${handoverId}`, dto).then((r) => r.data);
/** Takes no timestamp: the server stamps the signing time, which is what makes
 * it worth anything in a dispute. */
export const signHandover = (contractId: string, handoverId: string, signedBy: string) =>
  apiClient.post<Contract>(`/contracts/${contractId}/handovers/${handoverId}/sign`, { signedBy }).then((r) => r.data);
export const deleteHandover = (contractId: string, handoverId: string) =>
  apiClient.delete<Contract>(`/contracts/${contractId}/handovers/${handoverId}`).then((r) => r.data);

export const recordKeyMoney = (contractId: string, dto: RecordKeyMoneyInput) =>
  apiClient.post<Contract>(`/contracts/${contractId}/key-money`, dto).then((r) => r.data);

export const createClaim = (contractId: string, dto: CreateClaimInput) =>
  apiClient.post<Contract>(`/contracts/${contractId}/claims`, dto).then((r) => r.data);
export const payClaim = (contractId: string, claimId: string, paidAt: string) =>
  apiClient.post<Contract>(`/contracts/${contractId}/claims/${claimId}/pay`, { paidAt }).then((r) => r.data);
export const waiveClaim = (contractId: string, claimId: string, dto: { waivedAt: string; reason: string }) =>
  apiClient.post<Contract>(`/contracts/${contractId}/claims/${claimId}/waive`, dto).then((r) => r.data);

/** Renewal, the claim calls and both deposit calls return the whole contract,
 * so the screen refreshes from one response instead of refetching. */
export const recordDeposit = (contractId: string, dto: RecordDepositInput) =>
  apiClient.post<Contract>(`/contracts/${contractId}/deposits`, dto).then((r) => r.data);
export const settleDeposit = (contractId: string, depositId: string, dto: SettleDepositInput) =>
  apiClient.post<Contract>(`/contracts/${contractId}/deposits/${depositId}/settle`, dto).then((r) => r.data);

/** Contract attachments — signed lease PDFs, annexes, clearance letters.
 * Deliberately not ID scans — see the ContractAttachment model comment.
 * The bytes live
 * in object storage; these calls carry only metadata plus a short-lived signed
 * URL fetched on demand (see files.ts for why URLs aren't cached). */
export interface ContractAttachment {
  id: string;
  contractId: string;
  filename: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

export const listContractAttachments = (contractId: string) =>
  apiClient.get<ContractAttachment[]>(`/contracts/${contractId}/attachments`).then((r) => r.data);

export const uploadContractAttachment = async (contractId: string, file: File): Promise<ContractAttachment> => {
  const form = new FormData();
  // Content-Type left unset so the browser adds the multipart boundary itself.
  form.append('file', file);
  const res = await apiClient.post<ContractAttachment>(`/contracts/${contractId}/attachments`, form);
  return res.data;
};

export const contractAttachmentDownloadUrl = (attachmentId: string) =>
  apiClient.get<{ url: string; expiresInSeconds: number }>(`/contracts/attachments/${attachmentId}/download-url`).then((r) => r.data);

export const deleteContractAttachment = (attachmentId: string) => apiClient.delete(`/contracts/attachments/${attachmentId}`);

/** مرفقات المطالبات وصور نماذج التسليم — نفس نمط مرفقات العقد. */
export interface ClaimAttachment {
  id: string;
  claimId: string;
  filename: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

export const listClaimAttachments = (claimId: string) =>
  apiClient.get<ClaimAttachment[]>(`/contracts/claims/${claimId}/attachments`).then((r) => r.data);

export const uploadClaimAttachment = async (claimId: string, file: File): Promise<ClaimAttachment> => {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.post<ClaimAttachment>(`/contracts/claims/${claimId}/attachments`, form);
  return res.data;
};

export const claimAttachmentDownloadUrl = (attachmentId: string) =>
  apiClient.get<{ url: string; expiresInSeconds: number }>(`/contracts/claim-attachments/${attachmentId}/download-url`).then((r) => r.data);

export const deleteClaimAttachment = (attachmentId: string) => apiClient.delete(`/contracts/claim-attachments/${attachmentId}`);

export interface HandoverPhoto {
  id: string;
  handoverId: string;
  itemId: string | null;
  filename: string;
  size: number;
  mimeType: string;
  note: string | null;
  uploadedAt: string;
}

export const listHandoverPhotos = (handoverId: string) =>
  apiClient.get<HandoverPhoto[]>(`/contracts/handovers/${handoverId}/photos`).then((r) => r.data);

export const uploadHandoverPhoto = async (handoverId: string, file: File, opts?: { itemId?: string; note?: string }): Promise<HandoverPhoto> => {
  const form = new FormData();
  form.append('file', file);
  if (opts?.itemId) form.append('itemId', opts.itemId);
  if (opts?.note) form.append('note', opts.note);
  const res = await apiClient.post<HandoverPhoto>(`/contracts/handovers/${handoverId}/photos`, form);
  return res.data;
};

export const handoverPhotoDownloadUrl = (photoId: string) =>
  apiClient.get<{ url: string; expiresInSeconds: number }>(`/contracts/handover-photos/${photoId}/download-url`).then((r) => r.data);

export const deleteHandoverPhoto = (photoId: string) => apiClient.delete(`/contracts/handover-photos/${photoId}`);
