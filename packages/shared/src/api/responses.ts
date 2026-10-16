// ⛔ مولَّدٌ — لا يُحرَّر بيد.
// المصدرُ: وثيقةُ الواجهة المبنيّة (buildOpenApiDocument بعد nest build) — الردودُ المعلنة (ق-١٤٣٨).
// يُعاد توليدُه بـ: npm run openapi:snapshot  (من apps/api)
// والحارسُ خطوةُ openapi:check نفسُها — وصدقُه يشهد به scripts/response-truth.ts على التطبيق المبنيّ.

/** Response: `BankAccountTransferResponse` on the server. */
export interface BankAccountTransferResponse {
  kind: 'BANK_ACCOUNT';
  fromBranchId: string | null;
  toBranchId: string | null;
  bank: BankRowResponse;
}

/** Response: `BankRowResponse` on the server. */
export interface BankRowResponse {
  kind: 'CASH_BOX' | 'BANK_ACCOUNT' | 'LEGACY_UNDECLARED';
  id: string;
  name: string;
  branchId: string | null;
  iban: string | null;
  accountId: string;
  currency: string;
  balance: string;
  openingBalance: string;
  openingDate: string;
  archived: boolean;
  transferredToId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Response: `BanksRefResponse` on the server. */
export interface BanksRefResponse {
  id: string;
  name: string;
}

/** Response: `BankStatementLineResponse` on the server. */
export interface BankStatementLineResponse {
  id: string;
  bankId: string;
  branchId: string | null;
  date: string;
  description: string;
  amount: string;
  source: string | null;
  matched: boolean;
  entryNo: string | null;
  matchedLineId: string | null;
  matchedAt: string | null;
  currency: string;
  exchangeRate: string;
  baseAmount: string;
  createdAt: string;
  updatedAt: string;
}

/** Response: `BankTransferEntriesResponse` on the server. */
export interface BankTransferEntriesResponse {
  variance: string | null;
  out: string | null;
  in: string | null;
}

/** Response: `BranchResponse` on the server. */
export interface BranchResponse {
  id: string;
  name: string;
  type: string | null;
  activityId: string | null;
  propertyId: string | null;
  warehouseId: string | null;
  hours: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Response: `CashBoxTransferResponse` on the server. */
export interface CashBoxTransferResponse {
  kind: 'CASH_BOX';
  from: BankRowResponse;
  to: BankRowResponse;
  bookBalance: string;
  countedAmount: string;
  variance: string;
  entries: BankTransferEntriesResponse;
}

/** Response: `CashDepositListResponse` on the server. */
export interface CashDepositListResponse {
  items: CashDepositResponse[];
  inTransit: CashInTransitResponse;
}

/** Response: `CashDepositResponse` on the server. */
export interface CashDepositResponse {
  status: 'IN_TRANSIT' | 'CONFIRMED' | 'VOID';
  drawer: BanksRefResponse;
  bank: BanksRefResponse;
  id: string;
  no: string;
  date: string;
  amount: string;
  memo: string | null;
  drawerId: string;
  bankId: string;
  branchId: string | null;
  journalEntryId: string | null;
  voidJournalEntryId: string | null;
  confirmedTransactionId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Response: `CashInTransitResponse` on the server. */
export interface CashInTransitResponse {
  ledger: string;
  documents: string;
  matched: boolean;
}

/** Response: `CodeBandStatusResponse` on the server. */
export interface CodeBandStatusResponse {
  key: string;
  name: string;
  capacity: number;
  remaining: number;
  next: string | null;
  warnThreshold: number;
  warn: boolean;
}

/** Response: `ContractFeeResponse` on the server. */
export interface ContractFeeResponse {
  id: string;
  contractId: string;
  label: string;
  amount: string;
  effectiveFrom: string;
  endedAt: string | null;
}

/** Response: `CreatedCashDepositResponse` on the server. */
export interface CreatedCashDepositResponse {
  status: 'IN_TRANSIT' | 'CONFIRMED' | 'VOID';
  drawer: BanksRefResponse;
  bank: BanksRefResponse;
  id: string;
  no: string;
  date: string;
  amount: string;
  memo: string | null;
  drawerId: string;
  bankId: string;
  branchId: string | null;
  journalEntryId: string | null;
  voidJournalEntryId: string | null;
  confirmedTransactionId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  entryNo: string;
}

/** Response: `CreatedContractFeeResponse` on the server. */
export interface CreatedContractFeeResponse {
  id: string;
  contractId: string;
  label: string;
  amount: string;
  effectiveFrom: string;
  endedAt: string | null;
  raisedClaims: number;
}

/** Response: `CreatedNetworkSettlementResponse` on the server. */
export interface CreatedNetworkSettlementResponse {
  status: 'POSTED' | 'VOID';
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
  branchId: string | null;
  bankId: string;
  bank: BanksRefResponse;
  journalEntryId: string | null;
  voidJournalEntryId: string | null;
  receiptCount: number;
  entryNo: string;
}

/** Response: `CustomerDetailResponse` on the server. */
export interface CustomerDetailResponse {
  kind: 'NATURAL' | 'ESTABLISHMENT' | 'LEGAL_PERSON' | 'LEGACY_UNDECLARED';
  id: string;
  name: string;
  vatNumber: string | null;
  phone: string | null;
  creditLimit: string;
  otherIdScheme: string | null;
  otherIdOnFile: boolean;
  otherId: string | null;
  country: string;
  street: string | null;
  buildingNumber: string | null;
  district: string | null;
  city: string | null;
  postalCode: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Response: `EmployeeIdentityOnFileResponse` on the server. */
export interface EmployeeIdentityOnFileResponse {
  nationalId: boolean;
  salaryIban: boolean;
  socialInsuranceNo: boolean;
}

/** Response: `EmployeeLoginAccountResponse` on the server. */
export interface EmployeeLoginAccountResponse {
  id: string;
  name: string;
  branchIds: string[];
}

/** Response: `EmployeeWithLoginAccountResponse` on the server. */
export interface EmployeeWithLoginAccountResponse {
  status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  loginAccount: EmployeeLoginAccountResponse | null;
  id: string;
  fullName: string;
  branchId: string | null;
  companyUserId: string | null;
  archived: boolean;
  identityOnFile: EmployeeIdentityOnFileResponse;
  createdAt: string;
  updatedAt: string;
}

/** Response: `FormDeviceLinkResponse` on the server. */
export interface FormDeviceLinkResponse {
  url: string;
  expiresAt: string;
}

/** Response: `FormInstanceItemResponse` on the server. */
export interface FormInstanceItemResponse {
  itemType: 'CONDITION' | 'QTY' | 'NUMBER' | 'METER_READING' | 'TEMPERATURE' | 'BOOLEAN' | 'TEXT';
  itemId: string;
  lineNo: number;
  label: string;
  required: boolean;
  minValue: string | null;
  maxValue: string | null;
  isBlocking: boolean;
  unit: string | null;
  helpText: string | null;
  text: string | null;
  number: string | null;
  bool: boolean | null;
  note: string | null;
  outOfRange: boolean;
}

/** Response: `FormInstanceObjectionResponse` on the server. */
export interface FormInstanceObjectionResponse {
  note: string;
  byName: string;
  mobileMasked: string | null;
  hasPhoto: boolean;
  objectedAt: string;
}

/** Response: `FormInstanceResponse` on the server. */
export interface FormInstanceResponse {
  status: 'DRAFT' | 'SEALED' | 'AWAITING_SIGNATURE' | 'OBJECTED' | 'EXPIRED' | 'DISPUTED';
  id: string;
  templateVersionId: string;
  template: FormInstanceTemplateRefResponse;
  linkedEntityType: string;
  linkedEntityId: string;
  formDate: string;
  no: string | null;
  sealSeq: number | null;
  contentHash: string | null;
  prevHash: string | null;
  filledByName: string;
  sealedByName: string | null;
  sealedAt: string | null;
  sealFormat: number | null;
  createdAt: string;
  revisionGroupId: string;
  revisionNo: number;
  previousRevisionId: string | null;
  sentAt: string | null;
  signDeadline: string | null;
  nafathRequired: boolean;
  signatures: FormInstanceSignatureResponse[];
  objection: FormInstanceObjectionResponse | null;
  items: FormInstanceItemResponse[];
}

/** Response: `FormInstanceSignatureResponse` on the server. */
export interface FormInstanceSignatureResponse {
  role: 'STAFF' | 'COUNTERPARTY' | 'SUBSTITUTE' | 'REPRESENTATIVE';
  level: 'DRAWN_STAFF_SESSION' | 'DRAWN_OTP' | 'DRAWN_NAFATH' | 'PAPER_WITNESSED';
  channel: 'LINK' | 'STAFF_DEVICE' | 'PAPER';
  id: string;
  signerName: string;
  mobileMasked: string | null;
  witnessUserName: string | null;
  authorityType: string | null;
  authorityRef: string | null;
  authorityVerification: string | null;
  signedAt: string;
}

/** Response: `FormInstanceTemplateRefResponse` on the server. */
export interface FormInstanceTemplateRefResponse {
  id: string;
  familyId: string;
  version: number;
  name: string;
  formType: FormInstanceTypeRefResponse;
}

/** Response: `FormInstanceTypeRefResponse` on the server. */
export interface FormInstanceTypeRefResponse {
  id: string;
  code: string;
  name: string;
}

/** Response: `FormLinkMethodsResponse` on the server. */
export interface FormLinkMethodsResponse {
  otp: boolean;
  nafath: boolean;
}

/** Response: `FormLinkOpenResponse` on the server. */
export interface FormLinkOpenResponse {
  state: 'ACTIVE' | 'CLOSED';
  purpose: 'SIGN' | 'FINAL_COPY' | 'SUBSTITUTE_CONSENT';
  methods: FormLinkMethodsResponse;
  nafathAfterOtp: boolean;
  identityProvider: string | null;
}

/** Response: `FormNafathPollResponse` on the server. */
export interface FormNafathPollResponse {
  state: 'PENDING' | 'APPROVED';
  session: FormSessionResponse | null;
}

/** Response: `FormNafathStartResponse` on the server. */
export interface FormNafathStartResponse {
  displayCode: string;
}

/** Response: `FormObjectedResponse` on the server. */
export interface FormObjectedResponse {
  status: 'DRAFT' | 'SEALED' | 'AWAITING_SIGNATURE' | 'OBJECTED' | 'EXPIRED' | 'DISPUTED';
}

/** Response: `FormOtpIssuedResponse` on the server. */
export interface FormOtpIssuedResponse {
  challengeId: string;
  expiresAt: string;
  mobileMasked: string;
}

/** Response: `FormPaperSignedResponse` on the server. */
export interface FormPaperSignedResponse {
  finalCopy: 'SENT' | 'FAILED' | 'NONE';
  form: FormInstanceResponse;
}

/** Response: `FormPublicItemResponse` on the server. */
export interface FormPublicItemResponse {
  lineNo: number;
  label: string;
  itemType: string;
  unit: string | null;
  text: string | null;
  number: string | null;
  bool: boolean | null;
  note: string | null;
}

/** Response: `FormPublicSealResponse` on the server. */
export interface FormPublicSealResponse {
  no: string;
  contentHash: string;
  sealedAt: string;
  valid: boolean | null;
}

/** Response: `FormPublicSignatureResponse` on the server. */
export interface FormPublicSignatureResponse {
  role: 'STAFF' | 'COUNTERPARTY' | 'SUBSTITUTE' | 'REPRESENTATIVE';
  level: 'DRAWN_STAFF_SESSION' | 'DRAWN_OTP' | 'DRAWN_NAFATH' | 'PAPER_WITNESSED';
  channel: 'LINK' | 'STAFF_DEVICE' | 'PAPER';
  signerName: string;
  signedAt: string;
}

/** Response: `FormPublicSubstituteResponse` on the server. */
export interface FormPublicSubstituteResponse {
  name: string;
  mobileMasked: string;
}

/** Response: `FormPublicViewResponse` on the server. */
export interface FormPublicViewResponse {
  purpose: 'SIGN' | 'FINAL_COPY' | 'SUBSTITUTE_CONSENT';
  status: 'DRAFT' | 'SEALED' | 'AWAITING_SIGNATURE' | 'OBJECTED' | 'EXPIRED' | 'DISPUTED';
  templateName: string;
  formTypeName: string;
  formDate: string;
  revisionNo: number;
  signDeadline: string | null;
  nafathRequired: boolean;
  items: FormPublicItemResponse[];
  signatures: FormPublicSignatureResponse[];
  seal: FormPublicSealResponse | null;
  substitute: FormPublicSubstituteResponse | null;
}

/** Response: `FormSentResponse` on the server. */
export interface FormSentResponse {
  delivery: 'SENT' | 'FAILED';
  form: FormInstanceResponse;
}

/** Response: `FormSessionResponse` on the server. */
export interface FormSessionResponse {
  session: string;
  expiresAt: string;
}

/** Response: `FormSignedResponse` on the server. */
export interface FormSignedResponse {
  status: 'DRAFT' | 'SEALED' | 'AWAITING_SIGNATURE' | 'OBJECTED' | 'EXPIRED' | 'DISPUTED';
  finalCopy: 'SENT' | 'FAILED' | 'NONE';
}

/** Response: `FormSigningEventResponse` on the server. */
export interface FormSigningEventResponse {
  kind: string;
  actor: string;
  recipientMasked: string | null;
  note: string | null;
  at: string;
  revisionNo: number;
}

/** Response: `FormSigningSettingsResponse` on the server. */
export interface FormSigningSettingsResponse {
  nafathThreshold: string | null;
  currency: string;
  defaultSignPeriodDays: number;
  types: FormTypeSigningSettingResponse[];
}

/** Response: `FormSubstituteDecidedResponse` on the server. */
export interface FormSubstituteDecidedResponse {
  decision: 'APPROVED' | 'REJECTED';
  delivery: 'SENT' | 'FAILED' | 'NONE';
}

/** Response: `FormTemplateItemResponse` on the server. */
export interface FormTemplateItemResponse {
  itemType: 'CONDITION' | 'QTY' | 'NUMBER' | 'METER_READING' | 'TEMPERATURE' | 'BOOLEAN' | 'TEXT';
  id: string;
  lineNo: number;
  label: string;
  required: boolean;
  minValue: string | null;
  maxValue: string | null;
  isBlocking: boolean;
  unit: string | null;
  helpText: string | null;
}

/** Response: `FormTemplateResponse` on the server. */
export interface FormTemplateResponse {
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  id: string;
  companyId: string | null;
  formTypeId: string;
  formType: FormTypeResponse;
  familyId: string;
  version: number;
  name: string;
  description: string | null;
  sourceTemplateId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: FormTemplateItemResponse[];
}

/** Response: `FormTemplateRowResponse` on the server. */
export interface FormTemplateRowResponse {
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  id: string;
  companyId: string | null;
  formTypeId: string;
  formType: FormTypeResponse;
  familyId: string;
  version: number;
  name: string;
  description: string | null;
  sourceTemplateId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  sourceLatestVersion: number | null;
}

/** Response: `FormTypeResponse` on the server. */
export interface FormTypeResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sector: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Response: `FormTypeSigningSettingResponse` on the server. */
export interface FormTypeSigningSettingResponse {
  formTypeId: string;
  code: string;
  name: string;
  signPeriodDays: number;
  isDefault: boolean;
}

/** Response: `FormVerificationResponse` on the server. */
export interface FormVerificationResponse {
  no: string;
  contentHash: string;
  recomputedHash: string;
  contentIntact: boolean;
  chainLinked: boolean;
  valid: boolean;
}

/** Response: `LedgerSourceResponse` on the server. */
export interface LedgerSourceResponse {
  type: string;
  id: string;
  no: string;
}

/** Response: `NetworkSettlementListResponse` on the server. */
export interface NetworkSettlementListResponse {
  items: NetworkSettlementResponse[];
  summary: NetworkTransitSummaryResponse;
}

/** Response: `NetworkSettlementResponse` on the server. */
export interface NetworkSettlementResponse {
  status: 'POSTED' | 'VOID';
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
  branchId: string | null;
  bankId: string;
  bank: BanksRefResponse;
  journalEntryId: string | null;
  voidJournalEntryId: string | null;
  receiptCount: number;
}

/** Response: `NetworkTransitSummaryResponse` on the server. */
export interface NetworkTransitSummaryResponse {
  ledger: string;
  open: string;
  openCount: number;
  matched: boolean;
}

/** Response: `NumberGapSeriesResponse` on the server. */
export interface NumberGapSeriesResponse {
  kind: string;
  year: number;
  taken: number;
  firstRecorded: number | null;
  lastRecorded: number | null;
  recordedSince: string | null;
  unused: TakenNumberResponse[];
  pending: TakenNumberResponse[];
}

/** Response: `NumberGapsResponse` on the server. */
export interface NumberGapsResponse {
  asOf: string;
  series: NumberGapSeriesResponse[];
}

/** Response: `OpenNetworkReceiptResponse` on the server. */
export interface OpenNetworkReceiptResponse {
  id: string;
  no: string;
  date: string;
  branchId: string | null;
  customerName: string;
  signed: string;
}

/** Response: `OpenNetworkReceiptsResponse` on the server. */
export interface OpenNetworkReceiptsResponse {
  receipts: OpenNetworkReceiptResponse[];
  gross: string;
  summary: NetworkTransitSummaryResponse;
}

/** Response: `OwnerResetLinkResponse` on the server. */
export interface OwnerResetLinkResponse {
  sentTo: string;
}

/** Response: `PagedBankRowResponse` on the server. */
export interface PagedBankRowResponse {
  items: BankRowResponse[];
  total: number;
  page: number;
  pageSize: number;
}

/** Response: `PagedPosShiftResponse` on the server. */
export interface PagedPosShiftResponse {
  items: PosShiftWithTotalsResponse[];
  total: number;
  page: number;
  pageSize: number;
}

/** Response: `PlatformAuditPageResponse` on the server. */
export interface PlatformAuditPageResponse {
  items: PlatformAuditRowResponse[];
  total: number;
  page: number;
  pageSize: number;
}

/** Response: `PlatformAuditRowResponse` on the server. */
export interface PlatformAuditRowResponse {
  adminRole: 'OWNER' | 'SUPPORT' | 'FINANCE' | 'OPERATIONS' | 'COMPLIANCE';
  params: Record<string, string> | null;
  details: Record<string, unknown> | null;
  id: string;
  adminId: string;
  adminName: string;
  method: string;
  route: string;
  targetCompanyId: string | null;
  status: number;
  ip: string | null;
  createdAt: string;
}

/** Response: `PosAttemptEvidenceResponse` on the server. */
export interface PosAttemptEvidenceResponse {
  deviceReference: string | null;
  approvalCode: string | null;
  note: string | null;
}

/** Response: `PosCardVerificationListResponse` on the server. */
export interface PosCardVerificationListResponse {
  settlementDays: number;
  items: PosCardVerificationRowResponse[];
  unresolvedAttempts: PosUnresolvedAttemptRowResponse[];
}

/** Response: `PosCardVerificationRowResponse` on the server. */
export interface PosCardVerificationRowResponse {
  verification: 'DEVICE_REFERENCE' | 'MANUAL_EVIDENCE';
  posPaymentId: string;
  invoiceId: string;
  invoiceNo: string;
  issueDate: string;
  amount: string;
  deviceReference: string | null;
  approvalCode: string | null;
  resolvedByName: string | null;
  cashierName: string | null;
  receiptNo: string | null;
  settlementNo: string | null;
  matched: boolean;
  ageDays: number;
  overdue: boolean;
}

/** Response: `PosClearanceResponse` on the server. */
export interface PosClearanceResponse {
  status?: 'NOT_SUBMITTED' | 'SUBMITTING' | 'STAMPED' | 'CLEARED' | 'REJECTED';
  required: boolean;
  message?: string;
}

/** Response: `PosClosedShiftResponse` on the server. */
export interface PosClosedShiftResponse {
  status: 'OPEN' | 'CLOSED';
  salesCount: number;
  cashTotal: string;
  cardTotal: string;
  expectedCash: string;
  id: string;
  branchId: string | null;
  drawerId: string | null;
  openedById: string;
  openedByName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  declaredClosing: string | null;
  notes: string | null;
  variance: string;
  pendingAttempts: PosPendingAttemptResponse[];
}

/** Response: `PosCurrentShiftResponse` on the server. */
export interface PosCurrentShiftResponse {
  shift: PosShiftWithTotalsResponse | null;
}

/** Response: `PosIncidentItemResponse` on the server. */
export interface PosIncidentItemResponse {
  id: string;
  startedAt: string;
  endedAt: string;
  firstSyncedAt: string;
  gapMinutes: number;
  durationMinutes: number;
  salesCount: number;
}

/** Response: `PosIncidentsResponse` on the server. */
export interface PosIncidentsResponse {
  inferred: true;
  gapMinutes: number;
  items: PosIncidentItemResponse[];
}

/** Response: `PosOpenPaymentAttemptResponse` on the server. */
export interface PosOpenPaymentAttemptResponse {
  status: 'CREATED' | 'CHARGING' | 'APPROVED' | 'COMPLETED' | 'DECLINED' | 'UNKNOWN' | 'CANCELLED';
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT' | null;
  resolution: 'PROVIDER_CHARGE' | 'PROVIDER_STATUS' | 'MANUAL_EVIDENCE' | 'CANCELLED' | null;
  id: string;
  clientSaleId: string;
  shiftId: string;
  cardAmount: string;
  total: string;
  currency: string;
  provider: string;
  providerRef: string | null;
  approvalCode: string | null;
  declineReason: string | null;
  detail: string | null;
  invoiceId: string | null;
  chargeStartedAt: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  evidence: PosAttemptEvidenceResponse | null;
  createdAt: string;
  cashierName: string;
}

/** Response: `PosPaymentAttemptResponse` on the server. */
export interface PosPaymentAttemptResponse {
  status: 'CREATED' | 'CHARGING' | 'APPROVED' | 'COMPLETED' | 'DECLINED' | 'UNKNOWN' | 'CANCELLED';
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT' | null;
  resolution: 'PROVIDER_CHARGE' | 'PROVIDER_STATUS' | 'MANUAL_EVIDENCE' | 'CANCELLED' | null;
  id: string;
  clientSaleId: string;
  shiftId: string;
  cardAmount: string;
  total: string;
  currency: string;
  provider: string;
  providerRef: string | null;
  approvalCode: string | null;
  declineReason: string | null;
  detail: string | null;
  invoiceId: string | null;
  chargeStartedAt: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  evidence: PosAttemptEvidenceResponse | null;
  createdAt: string;
}

/** Response: `PosPaymentAttemptWithSaleResponse` on the server. */
export interface PosPaymentAttemptWithSaleResponse {
  status: 'CREATED' | 'CHARGING' | 'APPROVED' | 'COMPLETED' | 'DECLINED' | 'UNKNOWN' | 'CANCELLED';
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT' | null;
  resolution: 'PROVIDER_CHARGE' | 'PROVIDER_STATUS' | 'MANUAL_EVIDENCE' | 'CANCELLED' | null;
  id: string;
  clientSaleId: string;
  shiftId: string;
  cardAmount: string;
  total: string;
  currency: string;
  provider: string;
  providerRef: string | null;
  approvalCode: string | null;
  declineReason: string | null;
  detail: string | null;
  invoiceId: string | null;
  chargeStartedAt: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  evidence: PosAttemptEvidenceResponse | null;
  createdAt: string;
  sale: PosSaleReceiptResponse | null;
}

/** Response: `PosPaymentModeResponse` on the server. */
export interface PosPaymentModeResponse {
  active: boolean;
  provider?: string;
  deadlineMs?: number;
}

/** Response: `PosPaymentRowResponse` on the server. */
export interface PosPaymentRowResponse {
  method: 'CASH' | 'CARD';
  verification: 'PROVIDER_APPROVED' | 'DEVICE_REFERENCE' | 'MANUAL_EVIDENCE' | 'CASHIER_CONFIRMED' | null;
  id: string;
  amount: string;
  providerRef: string | null;
  deviceReference: string | null;
  approvalCode: string | null;
  attemptId: string | null;
  createdAt: string;
}

/** Response: `PosPendingAttemptResponse` on the server. */
export interface PosPendingAttemptResponse {
  status: 'CHARGING' | 'UNKNOWN' | 'APPROVED';
  id: string;
  cardAmount: string;
  clientSaleId: string;
  createdAt: string;
}

/** Response: `PosSaleCustomerResponse` on the server. */
export interface PosSaleCustomerResponse {
  kind: 'NATURAL' | 'ESTABLISHMENT' | 'LEGAL_PERSON' | 'LEGACY_UNDECLARED';
  id: string;
  name: string;
  vatNumber: string | null;
  phone: string | null;
  otherIdScheme: string | null;
  country: string;
}

/** Response: `PosSaleLineResponse` on the server. */
export interface PosSaleLineResponse {
  taxCategory: 'S' | 'Z' | 'E' | 'O' | 'LEGACY_STANDARD' | 'LEGACY_ZERO';
  id: string;
  lineNo: number;
  description: string;
  productId: string | null;
  quantity: string;
  unitCode: string | null;
  unitPrice: string;
  discount: string;
  taxRate: string;
  taxExemptionReasonCode: string | null;
  taxExemptionReason: string | null;
}

/** Response: `PosSaleReceiptResponse` on the server. */
export interface PosSaleReceiptResponse {
  docType: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'PREPAYMENT';
  status: 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT' | null;
  receiptQr: string | null;
  stamped: boolean;
  id: string;
  no: string;
  customerId: string;
  branchId: string | null;
  issueDate: string;
  dueDate: string;
  issuedAt: string | null;
  issuedOffsetMin: number | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  notes: string | null;
  currency: string;
  exchangeRate: string;
  posShiftId: string | null;
  clientSaleId: string | null;
  offlineRef: string | null;
  createdAt: string;
  lines: PosSaleLineResponse[];
  customer: PosSaleCustomerResponse;
  posPayments: PosPaymentRowResponse[];
}

/** Response: `PosSaleResponse` on the server. */
export interface PosSaleResponse {
  docType: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'PREPAYMENT';
  status: 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT' | null;
  stockDeduction: PosStockDeductedResponse | PosStockSkippedResponse;
  stampError: string | null;
  clearance: PosClearanceResponse;
  receiptQr: string | null;
  stamped: boolean;
  id: string;
  no: string;
  customerId: string;
  branchId: string | null;
  issueDate: string;
  dueDate: string;
  issuedAt: string | null;
  issuedOffsetMin: number | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  notes: string | null;
  currency: string;
  exchangeRate: string;
  posShiftId: string | null;
  clientSaleId: string | null;
  offlineRef: string | null;
  createdAt: string;
  lines: PosSaleLineResponse[];
  customer: PosSaleCustomerResponse;
  posPayments: PosPaymentRowResponse[];
}

/** Response: `PosShiftResponse` on the server. */
export interface PosShiftResponse {
  status: 'OPEN' | 'CLOSED';
  id: string;
  branchId: string | null;
  drawerId: string | null;
  openedById: string;
  openedByName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  declaredClosing: string | null;
  notes: string | null;
}

/** Response: `PosShiftWithTotalsResponse` on the server. */
export interface PosShiftWithTotalsResponse {
  status: 'OPEN' | 'CLOSED';
  salesCount: number;
  cashTotal: string;
  cardTotal: string;
  expectedCash: string;
  id: string;
  branchId: string | null;
  drawerId: string | null;
  openedById: string;
  openedByName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  declaredClosing: string | null;
  notes: string | null;
}

/** Response: `PosStockBelowZeroResponse` on the server. */
export interface PosStockBelowZeroResponse {
  productId: string;
  resultingQty: string;
}

/** Response: `PosStockDeductedResponse` on the server. */
export interface PosStockDeductedResponse {
  deducted: true;
  warehouseId: string;
  movements: number;
  belowZero: PosStockBelowZeroResponse[];
  provisionalQty: string;
  zeroCostProvisional: PosZeroCostProvisionalResponse[];
}

/** Response: `PosStockSkippedResponse` on the server. */
export interface PosStockSkippedResponse {
  deducted: false;
  reason: 'NO_BRANCH_WAREHOUSE' | 'NO_TRACKED_PRODUCTS';
}

/** Response: `PosSyncedSaleResponse` on the server. */
export interface PosSyncedSaleResponse {
  docType: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'PREPAYMENT';
  status: 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT' | null;
  stockDeduction?: PosStockDeductedResponse | PosStockSkippedResponse;
  stampError?: string | null;
  clearance?: PosClearanceResponse;
  receiptQr: string | null;
  stamped: boolean;
  id: string;
  no: string;
  customerId: string;
  branchId: string | null;
  issueDate: string;
  dueDate: string;
  issuedAt: string | null;
  issuedOffsetMin: number | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  notes: string | null;
  currency: string;
  exchangeRate: string;
  posShiftId: string | null;
  clientSaleId: string | null;
  offlineRef: string | null;
  createdAt: string;
  lines: PosSaleLineResponse[];
  customer: PosSaleCustomerResponse;
  posPayments: PosPaymentRowResponse[];
}

/** Response: `PosUnresolvedAttemptRowResponse` on the server. */
export interface PosUnresolvedAttemptRowResponse {
  status: 'CHARGING' | 'UNKNOWN' | 'APPROVED';
  attemptId: string;
  amount: string;
  provider: string;
  createdAt: string;
  detail: string | null;
  cashierName: string;
  shiftClosedAt: string | null;
}

/** Response: `PosZeroCostProvisionalResponse` on the server. */
export interface PosZeroCostProvisionalResponse {
  costSource: 'WAREHOUSE_LAYER' | 'PRODUCT_LAYER' | 'PRODUCT_CARD' | 'NONE';
  productId: string;
  qty: string;
}

/** Response: `ReconciliationBankResponse` on the server. */
export interface ReconciliationBankResponse {
  id: string;
  name: string;
  accountId: string;
  reconciledUntil: string | null;
  mirrorBalance: string;
}

/** Response: `ReconciliationLedgerResponse` on the server. */
export interface ReconciliationLedgerResponse {
  opening: string;
  closing: string;
  rows: ReconciliationLedgerRowResponse[];
  truncated: boolean;
}

/** Response: `ReconciliationLedgerRowResponse` on the server. */
export interface ReconciliationLedgerRowResponse {
  lineId: string;
  entryId: string;
  entryNo: string;
  date: string;
  memo: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  balance: string;
  source: LedgerSourceResponse;
  branchId: string | null;
  customerId: string | null;
  supplierId: string | null;
  propertyId: string | null;
  unitId: string | null;
  matched: boolean;
}

/** Response: `ReconciliationOverviewResponse` on the server. */
export interface ReconciliationOverviewResponse {
  bank: ReconciliationBankResponse;
  from: string | null;
  to: string | null;
  statement: ReconciliationStatementRowResponse[];
  ledger: ReconciliationLedgerResponse;
  suggestions: ReconciliationSuggestionResponse[];
  totals: ReconciliationTotalsResponse;
}

/** Response: `ReconciliationStatementRowResponse` on the server. */
export interface ReconciliationStatementRowResponse {
  id: string;
  date: string;
  description: string;
  amount: string;
  matchedLineId: string | null;
  matchedAt: string | null;
  source: string | null;
}

/** Response: `ReconciliationStateResponse` on the server. */
export interface ReconciliationStateResponse {
  bankId: string;
  reconciledUntil: string | null;
}

/** Response: `ReconciliationSuggestionResponse` on the server. */
export interface ReconciliationSuggestionResponse {
  transactionId: string;
  lineIds: string[];
}

/** Response: `ReconciliationTotalsResponse` on the server. */
export interface ReconciliationTotalsResponse {
  unmatchedStatement: string;
  unmatchedStatementCount: number;
  unmatchedLedger: string;
  unmatchedLedgerCount: number;
}

/** Response: `TakenNumberResponse` on the server. */
export interface TakenNumberResponse {
  no: string;
  number: number;
  allocatedAt: string;
}

/** Response: `VoidedCashDepositResponse` on the server. */
export interface VoidedCashDepositResponse {
  status: 'IN_TRANSIT' | 'CONFIRMED' | 'VOID';
  voidEntryNo: string;
  id: string;
  no: string;
  date: string;
  amount: string;
  memo: string | null;
  drawerId: string;
  bankId: string;
  branchId: string | null;
  journalEntryId: string | null;
  voidJournalEntryId: string | null;
  confirmedTransactionId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Response: `VoidedNetworkSettlementResponse` on the server. */
export interface VoidedNetworkSettlementResponse {
  status: 'POSTED' | 'VOID';
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
  branchId: string | null;
  bankId: string;
  bank: BanksRefResponse;
  journalEntryId: string | null;
  voidJournalEntryId: string | null;
  receiptCount: number;
  voidEntryNo: string;
}
