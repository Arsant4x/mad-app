import type { MoneyText } from '../lib/money';
import { apiClient } from './client';
import { withRequestKey } from './idempotency';
import type { Unit } from './units';
import type { ChargeTaxTreatment, ClaimKind, ClaimStatus, ContractClassification, ContractCycle, ContractLessor, ContractStatus, ContractVatInclusion, DeductionKind, DepositHolder, DepositStatus, DepositType, Furnished, HandoverStatus, HandoverType, InstallmentStatus, ItemCondition, KeyMoneyDirection, RecordPaymentMethod, RentPaymentMethod, SettlementBasis } from '@mad-app/shared/api/enums';
import type { CancelContractDto, ContractFeeDto, ContractsListQuery, CreateClaimDto, CreateContractDto, CreateHandoverDto, EndContractFeeDto, HandoverItemDto, RecordDepositDto, RecordKeyMoneyDto, RecordPaymentDto, RenewContractDto, SettleDepositDto, UpdateContractDto, UpdateHandoverDto } from '@mad-app/shared/api/requests';
import type { ContractFeeResponse, CreatedContractFeeResponse } from '@mad-app/shared/api/responses';

export type { ContractStatus };
export type { ContractCycle };
export type { Furnished };
/** تصنيفُ العقد للضريبة — على العقد لا العقار ولا الوحدة (ق-٨٩١)؛ والقيمةُ القديمة للصفوف
 * التي سبقت الهجرة وحدَها، ولا يقبلها الخادمُ لعقدٍ جديد. */
export type { ContractClassification };
/** أقيمةُ العقد شاملةٌ لضريبة القيمة المضافة أم لا — تُعلَن ولا تُفترض (ق-٨٩٢). */
export type { ContractVatInclusion };
/** ⚖️ من المؤجّر (السؤال ٥٧٧ · ق-١٦٠٠) — يُعلَن على عقار التشغيل؛ والقيمةُ القديمة لعقدٍ عليه سبق الحقل. */
export type { ContractLessor };
export type DeclaredClassification = Exclude<ContractClassification, 'LEGACY_UNCLASSIFIED'>;
export type DeclaredVatInclusion = Exclude<ContractVatInclusion, 'LEGACY_UNDECLARED'>;
/** مولَّدٌ من `InstallmentStatus` في المخطّط عبر سجلّ التعدادات (`ق-١٣٨٤` — وكان منسوخاً بيدٍ: دَينُ 4.5) — `PARTIAL` مسدَّدٌ بعضُه، تُشتقّ من المقبوض مقابل الإجماليّ (ق-١٠٤٠). */
export type { InstallmentStatus };
/**
 * طريقةُ سداد الإيجار **كما يحملها عمودُها** (`PaymentMethod` — ومنها `CARD` «الشبكة») — `ق-١٣٦٧`: كانت `PaymentMethod` هنا نقداً وبنكاً
 * وحدهما (حدَّ الإدخال) **وباسمٍ يتكرّر في `payments.ts` بمجموعةٍ أخرى**، فسندٌ بالشبكة كان يُعرض «تحويل بنكي».
 */
export type { RentPaymentMethod };
/** ما يقبله الخادمُ في تسجيل السداد (`@IsIn` على `RecordPaymentDto.method`). */
export type { RecordPaymentMethod };

export interface Installment {
  id: string;
  dueDate: string;
  amount: string;
  status: InstallmentStatus;
  notes: string | null;
  /** إجماليُّ القسط بالضريبة ومسدَّدُه ومتبقّيه — يحسبها الخادم في `GET /contracts/:id` وحده (`ق-١٢٤٣`)؛ نصٌّ بخانتين، والمتبقّي موقَّع. */
  gross?: MoneyText;
  settled?: MoneyText;
  remaining?: MoneyText;
}

export interface RentPayment {
  id: string;
  installmentId: string | null;
  date: string;
  amount: string;
  discount: string;
  netAmount: string;
  method: RentPaymentMethod;
  bankId: string | null;
  notes: string | null;
  journalEntryId: string | null;
}

export interface Contract {
  id: string;
  unitId: string;
  /** والملكيةُ تقرّر هل يُعلَن المؤجّر (عقارُ التشغيل وحدَه — السؤال ٥٧٧). */
  unit: Unit & { property: { id: string; name: string; ownership?: string } };
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
  lessor: ContractLessor;
  ownerName: string | null;
  ownerVatNumber: string | null;
  /** ⚖️ المختلطُ وحدَه (السؤال ٤١٢): نصيبُ الجزء المعفى بالمئة وأساسُه كما أعلنه المؤجّر — فارغان لغيره. */
  exemptSharePercent: string | null;
  exemptShareBasis: string | null;
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
  /** ⚖️ بنودُ الرسوم فوق الإيجار (السؤالان ٤٩ و٤١٣ · ق-١٦٠٠) — كلٌّ يُطالَب مع كلِّ قسطٍ يحلّ مطالبةً خاضعة نوعُها `FEE`. */
  fees?: ContractFee[];
  keyMoney: ContractKeyMoney[];
  handovers: ContractHandover[];
  /** مجموعُ المطالبات المفتوحة والتأميناتُ المحجوزة لدى المنشأة — من الخادم في `GET /contracts/:id` وحده (`ق-١٢٤٣`). */
  claimsOutstanding?: MoneyText;
  depositsHeld?: MoneyText;
  /** ⚖️ مدّةُ حفظ صور نماذج التسليم كما يُعلَم بها المستأجر (`ق-١٦٠٠` · السؤال ٢٤٣) — من مدد الحفظ في الخادم. */
  handoverPhotoRetentionYears?: number;
}

export type { HandoverType };
export type { HandoverStatus };
export type { ItemCondition };

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
  /** ⚖️ إعلامُ المستأجر بحفظ الصور: المدّةُ المعلنة يومَ التوقيع ووقتُه — يختمهما الخادمُ لنموذجٍ عليه صور. */
  photoNoticeYears: number | null;
  photoNoticeAt: string | null;
  /** صورُ النموذج كما يُرجعها الخادم مع العقد (بلا مفتاح التخزين) — للعدّ هنا، والعرضُ من قائمتها. */
  photos?: { id: string }[];
  items: HandoverItem[];
}

export type HandoverItemInput = HandoverItemDto;

export type CreateHandoverInput = CreateHandoverDto;

export type UpdateHandoverInput = UpdateHandoverDto;

/** Which way the key money went — it decides the accounting, not just the
 * label: received is income, paid is an asset the company bought. */
export type { KeyMoneyDirection };

export interface ContractKeyMoney {
  id: string;
  direction: KeyMoneyDirection;
  amount: string;
  note: string | null;
  currency: string;
  paidAt: string;
  journalEntryId: string | null;
}

export type RecordKeyMoneyInput = RecordKeyMoneyDto;

export type { ClaimKind };
export type { ClaimStatus };
/** ⚖️ معاملةُ المطالبة والخصم الضريبية (الأسئلة ٥١ و٤١٣ و٤١٤ · ق-١٦٠٠) — والقديمةُ `LEGACY_UNTAXED` تُقرأ ولا تُختار. */
export type { ChargeTaxTreatment };
export type DeclaredChargeTaxTreatment = Exclude<ChargeTaxTreatment, 'LEGACY_UNTAXED'>;

export interface ContractClaim {
  id: string;
  kind: ClaimKind;
  /** صافياً — والخاضعةُ ضريبتُها في `taxAmount` فوقه. */
  amount: string;
  taxTreatment: ChargeTaxTreatment;
  taxAmount: string;
  onBehalfEvidence: string | null;
  description: string;
  currency: string;
  issuedAt: string;
  status: ClaimStatus;
  settledAt: string | null;
  waiveReason: string | null;
  journalEntryId: string | null;
  settlementEntryId: string | null;
}

export type CreateClaimInput = CreateClaimDto;

export type { DepositType };
/** Who is holding the money. EJAR means the platform blocked it and the
 * company never received it — nothing is posted to the ledger. */
export type { DepositHolder };
export type { DepositStatus };
export type { DeductionKind };

export interface DepositDeduction {
  id: string;
  kind: DeductionKind;
  /** إجماليٌّ — ما خرج من التأمين؛ والخاضعُ ضريبتُه منه. */
  amount: string;
  reason: string;
  taxTreatment: ChargeTaxTreatment | null;
  baseTax: string;
  onBehalfEvidence: string | null;
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

export type RecordDepositInput = RecordDepositDto;

export type SettleDepositInput = SettleDepositDto;

export type CreateContractInput = CreateContractDto;

export type UpdateContractInput = UpdateContractDto;

/** How the early-termination settlement is worked out. The last two are
 * conveniences that compute an amount from the remaining installments. */
export type { SettlementBasis };

export type CancelContractInput = CancelContractDto;

export type RecordPaymentInput = RecordPaymentDto;

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

export type ListContractsParams = ContractsListQuery;

export const listContracts = (params: ListContractsParams = {}) =>
  apiClient.get<ContractListResponse>('/contracts', { params }).then((r) => r.data);
export const getContract = (id: string) => apiClient.get<Contract>(`/contracts/${id}`).then((r) => r.data);
export const createContract = (dto: CreateContractInput) => apiClient.post<Contract>('/contracts', dto).then((r) => r.data);

/** ⚖️ بندُ رسم: إضافتُه (ويُطالَب لما حلّ منذ سريانه) وإنهاؤه (لا حذف). */
export interface ContractFee {
  id: string;
  label: string;
  /** لكلِّ قسط صافياً — والضريبةُ فوقه على مطالبته. */
  amount: string;
  effectiveFrom: string;
  endedAt: string | null;
}
/** الخادمُ يردّ البندَ وحدَه (`ContractFeeResponse` · `ق-١٤٣٨`)، فيُقرأ العقدُ بعده بمطالباته التي رُفعت معه. */
export const addContractFee = async (contractId: string, dto: ContractFeeDto): Promise<Contract> => {
  await apiClient.post<CreatedContractFeeResponse>(`/contracts/${contractId}/fees`, dto);
  return getContract(contractId);
};
export const endContractFee = async (contractId: string, feeId: string, dto: EndContractFeeDto): Promise<Contract> => {
  await apiClient.post<ContractFeeResponse>(`/contracts/${contractId}/fees/${feeId}/end`, dto);
  return getContract(contractId);
};
export const updateContract = (id: string, dto: UpdateContractInput) => apiClient.patch<Contract>(`/contracts/${id}`, dto).then((r) => r.data);
export const cancelContract = (id: string, dto: CancelContractInput) => apiClient.post<Contract>(`/contracts/${id}/cancel`, dto).then((r) => r.data);
/** و`requestKey` مفتاحُ نافذة القبض الواحدة — يعيد القبضَ نفسَه إن أُعيد الطلب (توجيه ٢٧٦ · ق-١٦٠٩/ب). */
export const recordPayment = (contractId: string, dto: RecordPaymentInput, requestKey?: string) =>
  apiClient.post<RentPayment>(`/contracts/${contractId}/payments`, dto, withRequestKey(requestKey)).then((r) => r.data);
export type RenewContractInput = RenewContractDto;

export const renewContract = (id: string, dto: RenewContractInput) =>
  apiClient.post<Contract>(`/contracts/${id}/renew`, dto).then((r) => r.data);

export const createHandover = (contractId: string, dto: CreateHandoverInput) =>
  apiClient.post<Contract>(`/contracts/${contractId}/handovers`, dto).then((r) => r.data);
export const updateHandover = (contractId: string, handoverId: string, dto: UpdateHandoverInput) =>
  apiClient.patch<Contract>(`/contracts/${contractId}/handovers/${handoverId}`, dto).then((r) => r.data);
/** Takes no timestamp: the server stamps the signing time, which is what makes
 * it worth anything in a dispute. */
export const signHandover = (contractId: string, handoverId: string, signedBy: string, photoNoticeGiven?: boolean) =>
  apiClient
    .post<Contract>(`/contracts/${contractId}/handovers/${handoverId}/sign`, photoNoticeGiven ? { signedBy, photoNoticeGiven } : { signedBy })
    .then((r) => r.data);
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

/**
 * ⚖️ ق-١٣٦٥ — مرفقُ العقد في المخزن الحسّاس: **يُنزَّل عبر الخادم مفكوكاً** (blob بالرأس Authorization) — لا رابطَ موقَّعاً له.
 */
export const downloadContractAttachment = async (attachmentId: string, filename: string) => {
  const res = await apiClient.get(`/contracts/attachments/${attachmentId}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

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
