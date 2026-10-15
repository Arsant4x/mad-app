// ⛔ مولَّدٌ — لا يُحرَّر بيد.
// المصدرُ: وثيقةُ الواجهة المبنيّة (buildOpenApiDocument بعد nest build) — الردودُ المعلنة (ق-١٤٣٨).
// يُعاد توليدُه بـ: npm run openapi:snapshot  (من apps/api)
// والحارسُ خطوةُ openapi:check نفسُها — وصدقُه يشهد به scripts/response-truth.ts على التطبيق المبنيّ.

/** ردٌّ — `BankAccountTransferResponse` في الخادم (ق-١٤٣٨). */
export interface BankAccountTransferResponse {
  kind: 'BANK_ACCOUNT';
  fromBranchId: string | null;
  toBranchId: string | null;
  bank: BankRowResponse;
}

/** ردٌّ — `BankRowResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `BanksRefResponse` في الخادم (ق-١٤٣٨). */
export interface BanksRefResponse {
  id: string;
  name: string;
}

/** ردٌّ — `BankStatementLineResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `BankTransferEntriesResponse` في الخادم (ق-١٤٣٨). */
export interface BankTransferEntriesResponse {
  variance: string | null;
  out: string | null;
  in: string | null;
}

/** ردٌّ — `BranchResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `CashBoxTransferResponse` في الخادم (ق-١٤٣٨). */
export interface CashBoxTransferResponse {
  kind: 'CASH_BOX';
  from: BankRowResponse;
  to: BankRowResponse;
  bookBalance: string;
  countedAmount: string;
  variance: string;
  entries: BankTransferEntriesResponse;
}

/** ردٌّ — `CashDepositListResponse` في الخادم (ق-١٤٣٨). */
export interface CashDepositListResponse {
  items: CashDepositResponse[];
  inTransit: CashInTransitResponse;
}

/** ردٌّ — `CashDepositResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `CashInTransitResponse` في الخادم (ق-١٤٣٨). */
export interface CashInTransitResponse {
  ledger: string;
  documents: string;
  matched: boolean;
}

/** ردٌّ — `CodeBandStatusResponse` في الخادم (ق-١٤٣٨). */
export interface CodeBandStatusResponse {
  key: string;
  name: string;
  capacity: number;
  remaining: number;
  next: string | null;
  warnThreshold: number;
  warn: boolean;
}

/** ردٌّ — `ContractFeeResponse` في الخادم (ق-١٤٣٨). */
export interface ContractFeeResponse {
  id: string;
  contractId: string;
  label: string;
  amount: string;
  effectiveFrom: string;
  endedAt: string | null;
}

/** ردٌّ — `CreatedCashDepositResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `CreatedContractFeeResponse` في الخادم (ق-١٤٣٨). */
export interface CreatedContractFeeResponse {
  id: string;
  contractId: string;
  label: string;
  amount: string;
  effectiveFrom: string;
  endedAt: string | null;
  raisedClaims: number;
}

/** ردٌّ — `CreatedNetworkSettlementResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `CustomerDetailResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `EmployeeIdentityOnFileResponse` في الخادم (ق-١٤٣٨). */
export interface EmployeeIdentityOnFileResponse {
  nationalId: boolean;
  salaryIban: boolean;
  socialInsuranceNo: boolean;
}

/** ردٌّ — `EmployeeLoginAccountResponse` في الخادم (ق-١٤٣٨). */
export interface EmployeeLoginAccountResponse {
  id: string;
  name: string;
  branchIds: string[];
}

/** ردٌّ — `EmployeeWithLoginAccountResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `FormDeviceLinkResponse` في الخادم (ق-١٤٣٨). */
export interface FormDeviceLinkResponse {
  url: string;
  expiresAt: string;
}

/** ردٌّ — `FormInstanceItemResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `FormInstanceObjectionResponse` في الخادم (ق-١٤٣٨). */
export interface FormInstanceObjectionResponse {
  note: string;
  byName: string;
  mobileMasked: string | null;
  hasPhoto: boolean;
  objectedAt: string;
}

/** ردٌّ — `FormInstanceResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `FormInstanceSignatureResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `FormInstanceTemplateRefResponse` في الخادم (ق-١٤٣٨). */
export interface FormInstanceTemplateRefResponse {
  id: string;
  familyId: string;
  version: number;
  name: string;
  formType: FormInstanceTypeRefResponse;
}

/** ردٌّ — `FormInstanceTypeRefResponse` في الخادم (ق-١٤٣٨). */
export interface FormInstanceTypeRefResponse {
  id: string;
  code: string;
  name: string;
}

/** ردٌّ — `FormLinkMethodsResponse` في الخادم (ق-١٤٣٨). */
export interface FormLinkMethodsResponse {
  otp: boolean;
  nafath: boolean;
}

/** ردٌّ — `FormLinkOpenResponse` في الخادم (ق-١٤٣٨). */
export interface FormLinkOpenResponse {
  state: 'ACTIVE' | 'CLOSED';
  purpose: 'SIGN' | 'FINAL_COPY' | 'SUBSTITUTE_CONSENT';
  methods: FormLinkMethodsResponse;
  nafathAfterOtp: boolean;
  identityProvider: string | null;
}

/** ردٌّ — `FormNafathPollResponse` في الخادم (ق-١٤٣٨). */
export interface FormNafathPollResponse {
  state: 'PENDING' | 'APPROVED';
  session: FormSessionResponse | null;
}

/** ردٌّ — `FormNafathStartResponse` في الخادم (ق-١٤٣٨). */
export interface FormNafathStartResponse {
  displayCode: string;
}

/** ردٌّ — `FormObjectedResponse` في الخادم (ق-١٤٣٨). */
export interface FormObjectedResponse {
  status: 'DRAFT' | 'SEALED' | 'AWAITING_SIGNATURE' | 'OBJECTED' | 'EXPIRED' | 'DISPUTED';
}

/** ردٌّ — `FormOtpIssuedResponse` في الخادم (ق-١٤٣٨). */
export interface FormOtpIssuedResponse {
  challengeId: string;
  expiresAt: string;
  mobileMasked: string;
}

/** ردٌّ — `FormPaperSignedResponse` في الخادم (ق-١٤٣٨). */
export interface FormPaperSignedResponse {
  finalCopy: 'SENT' | 'FAILED' | 'NONE';
  form: FormInstanceResponse;
}

/** ردٌّ — `FormPublicItemResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `FormPublicSealResponse` في الخادم (ق-١٤٣٨). */
export interface FormPublicSealResponse {
  no: string;
  contentHash: string;
  sealedAt: string;
  valid: boolean | null;
}

/** ردٌّ — `FormPublicSignatureResponse` في الخادم (ق-١٤٣٨). */
export interface FormPublicSignatureResponse {
  role: 'STAFF' | 'COUNTERPARTY' | 'SUBSTITUTE' | 'REPRESENTATIVE';
  level: 'DRAWN_STAFF_SESSION' | 'DRAWN_OTP' | 'DRAWN_NAFATH' | 'PAPER_WITNESSED';
  channel: 'LINK' | 'STAFF_DEVICE' | 'PAPER';
  signerName: string;
  signedAt: string;
}

/** ردٌّ — `FormPublicSubstituteResponse` في الخادم (ق-١٤٣٨). */
export interface FormPublicSubstituteResponse {
  name: string;
  mobileMasked: string;
}

/** ردٌّ — `FormPublicViewResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `FormSentResponse` في الخادم (ق-١٤٣٨). */
export interface FormSentResponse {
  delivery: 'SENT' | 'FAILED';
  form: FormInstanceResponse;
}

/** ردٌّ — `FormSessionResponse` في الخادم (ق-١٤٣٨). */
export interface FormSessionResponse {
  session: string;
  expiresAt: string;
}

/** ردٌّ — `FormSignedResponse` في الخادم (ق-١٤٣٨). */
export interface FormSignedResponse {
  status: 'DRAFT' | 'SEALED' | 'AWAITING_SIGNATURE' | 'OBJECTED' | 'EXPIRED' | 'DISPUTED';
  finalCopy: 'SENT' | 'FAILED' | 'NONE';
}

/** ردٌّ — `FormSigningEventResponse` في الخادم (ق-١٤٣٨). */
export interface FormSigningEventResponse {
  kind: string;
  actor: string;
  recipientMasked: string | null;
  note: string | null;
  at: string;
  revisionNo: number;
}

/** ردٌّ — `FormSigningSettingsResponse` في الخادم (ق-١٤٣٨). */
export interface FormSigningSettingsResponse {
  nafathThreshold: string | null;
  currency: string;
  defaultSignPeriodDays: number;
  types: FormTypeSigningSettingResponse[];
}

/** ردٌّ — `FormSubstituteDecidedResponse` في الخادم (ق-١٤٣٨). */
export interface FormSubstituteDecidedResponse {
  decision: 'APPROVED' | 'REJECTED';
  delivery: 'SENT' | 'FAILED' | 'NONE';
}

/** ردٌّ — `FormTemplateItemResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `FormTemplateResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `FormTemplateRowResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `FormTypeResponse` في الخادم (ق-١٤٣٨). */
export interface FormTypeResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sector: string | null;
  createdAt: string;
  updatedAt: string;
}

/** ردٌّ — `FormTypeSigningSettingResponse` في الخادم (ق-١٤٣٨). */
export interface FormTypeSigningSettingResponse {
  formTypeId: string;
  code: string;
  name: string;
  signPeriodDays: number;
  isDefault: boolean;
}

/** ردٌّ — `FormVerificationResponse` في الخادم (ق-١٤٣٨). */
export interface FormVerificationResponse {
  no: string;
  contentHash: string;
  recomputedHash: string;
  contentIntact: boolean;
  chainLinked: boolean;
  valid: boolean;
}

/** ردٌّ — `LedgerSourceResponse` في الخادم (ق-١٤٣٨). */
export interface LedgerSourceResponse {
  type: string;
  id: string;
  no: string;
}

/** ردٌّ — `NetworkSettlementListResponse` في الخادم (ق-١٤٣٨). */
export interface NetworkSettlementListResponse {
  items: NetworkSettlementResponse[];
  summary: NetworkTransitSummaryResponse;
}

/** ردٌّ — `NetworkSettlementResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `NetworkTransitSummaryResponse` في الخادم (ق-١٤٣٨). */
export interface NetworkTransitSummaryResponse {
  ledger: string;
  open: string;
  openCount: number;
  matched: boolean;
}

/** ردٌّ — `NumberGapSeriesResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `NumberGapsResponse` في الخادم (ق-١٤٣٨). */
export interface NumberGapsResponse {
  asOf: string;
  series: NumberGapSeriesResponse[];
}

/** ردٌّ — `OpenNetworkReceiptResponse` في الخادم (ق-١٤٣٨). */
export interface OpenNetworkReceiptResponse {
  id: string;
  no: string;
  date: string;
  branchId: string | null;
  customerName: string;
  signed: string;
}

/** ردٌّ — `OpenNetworkReceiptsResponse` في الخادم (ق-١٤٣٨). */
export interface OpenNetworkReceiptsResponse {
  receipts: OpenNetworkReceiptResponse[];
  gross: string;
  summary: NetworkTransitSummaryResponse;
}

/** ردٌّ — `PagedBankRowResponse` في الخادم (ق-١٤٣٨). */
export interface PagedBankRowResponse {
  items: BankRowResponse[];
  total: number;
  page: number;
  pageSize: number;
}

/** ردٌّ — `PagedPosShiftResponse` في الخادم (ق-١٤٣٨). */
export interface PagedPosShiftResponse {
  items: PosShiftWithTotalsResponse[];
  total: number;
  page: number;
  pageSize: number;
}

/** ردٌّ — `PlatformAuditPageResponse` في الخادم (ق-١٤٣٨). */
export interface PlatformAuditPageResponse {
  items: PlatformAuditRowResponse[];
  total: number;
  page: number;
  pageSize: number;
}

/** ردٌّ — `PlatformAuditRowResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `PosAttemptEvidenceResponse` في الخادم (ق-١٤٣٨). */
export interface PosAttemptEvidenceResponse {
  deviceReference: string | null;
  approvalCode: string | null;
  note: string | null;
}

/** ردٌّ — `PosCardVerificationListResponse` في الخادم (ق-١٤٣٨). */
export interface PosCardVerificationListResponse {
  settlementDays: number;
  items: PosCardVerificationRowResponse[];
  unresolvedAttempts: PosUnresolvedAttemptRowResponse[];
}

/** ردٌّ — `PosCardVerificationRowResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `PosClearanceResponse` في الخادم (ق-١٤٣٨). */
export interface PosClearanceResponse {
  status?: 'NOT_SUBMITTED' | 'SUBMITTING' | 'STAMPED' | 'CLEARED' | 'REJECTED';
  required: boolean;
  message?: string;
}

/** ردٌّ — `PosClosedShiftResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `PosCurrentShiftResponse` في الخادم (ق-١٤٣٨). */
export interface PosCurrentShiftResponse {
  shift: PosShiftWithTotalsResponse | null;
}

/** ردٌّ — `PosIncidentItemResponse` في الخادم (ق-١٤٣٨). */
export interface PosIncidentItemResponse {
  id: string;
  startedAt: string;
  endedAt: string;
  firstSyncedAt: string;
  gapMinutes: number;
  durationMinutes: number;
  salesCount: number;
}

/** ردٌّ — `PosIncidentsResponse` في الخادم (ق-١٤٣٨). */
export interface PosIncidentsResponse {
  inferred: true;
  gapMinutes: number;
  items: PosIncidentItemResponse[];
}

/** ردٌّ — `PosOpenPaymentAttemptResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `PosPaymentAttemptResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `PosPaymentAttemptWithSaleResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `PosPaymentModeResponse` في الخادم (ق-١٤٣٨). */
export interface PosPaymentModeResponse {
  active: boolean;
  provider?: string;
  deadlineMs?: number;
}

/** ردٌّ — `PosPaymentRowResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `PosPendingAttemptResponse` في الخادم (ق-١٤٣٨). */
export interface PosPendingAttemptResponse {
  status: 'CHARGING' | 'UNKNOWN' | 'APPROVED';
  id: string;
  cardAmount: string;
  clientSaleId: string;
  createdAt: string;
}

/** ردٌّ — `PosSaleCustomerResponse` في الخادم (ق-١٤٣٨). */
export interface PosSaleCustomerResponse {
  kind: 'NATURAL' | 'ESTABLISHMENT' | 'LEGAL_PERSON' | 'LEGACY_UNDECLARED';
  id: string;
  name: string;
  vatNumber: string | null;
  phone: string | null;
  otherIdScheme: string | null;
  country: string;
}

/** ردٌّ — `PosSaleLineResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `PosSaleReceiptResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `PosSaleResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `PosShiftResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `PosShiftWithTotalsResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `PosStockBelowZeroResponse` في الخادم (ق-١٤٣٨). */
export interface PosStockBelowZeroResponse {
  productId: string;
  resultingQty: string;
}

/** ردٌّ — `PosStockDeductedResponse` في الخادم (ق-١٤٣٨). */
export interface PosStockDeductedResponse {
  deducted: true;
  warehouseId: string;
  movements: number;
  belowZero: PosStockBelowZeroResponse[];
  provisionalQty: string;
  zeroCostProvisional: PosZeroCostProvisionalResponse[];
}

/** ردٌّ — `PosStockSkippedResponse` في الخادم (ق-١٤٣٨). */
export interface PosStockSkippedResponse {
  deducted: false;
  reason: 'NO_BRANCH_WAREHOUSE' | 'NO_TRACKED_PRODUCTS';
}

/** ردٌّ — `PosSyncedSaleResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `PosUnresolvedAttemptRowResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `PosZeroCostProvisionalResponse` في الخادم (ق-١٤٣٨). */
export interface PosZeroCostProvisionalResponse {
  costSource: 'WAREHOUSE_LAYER' | 'PRODUCT_LAYER' | 'PRODUCT_CARD' | 'NONE';
  productId: string;
  qty: string;
}

/** ردٌّ — `ReconciliationBankResponse` في الخادم (ق-١٤٣٨). */
export interface ReconciliationBankResponse {
  id: string;
  name: string;
  accountId: string;
  reconciledUntil: string | null;
  mirrorBalance: string;
}

/** ردٌّ — `ReconciliationLedgerResponse` في الخادم (ق-١٤٣٨). */
export interface ReconciliationLedgerResponse {
  opening: string;
  closing: string;
  rows: ReconciliationLedgerRowResponse[];
  truncated: boolean;
}

/** ردٌّ — `ReconciliationLedgerRowResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `ReconciliationOverviewResponse` في الخادم (ق-١٤٣٨). */
export interface ReconciliationOverviewResponse {
  bank: ReconciliationBankResponse;
  from: string | null;
  to: string | null;
  statement: ReconciliationStatementRowResponse[];
  ledger: ReconciliationLedgerResponse;
  suggestions: ReconciliationSuggestionResponse[];
  totals: ReconciliationTotalsResponse;
}

/** ردٌّ — `ReconciliationStatementRowResponse` في الخادم (ق-١٤٣٨). */
export interface ReconciliationStatementRowResponse {
  id: string;
  date: string;
  description: string;
  amount: string;
  matchedLineId: string | null;
  matchedAt: string | null;
  source: string | null;
}

/** ردٌّ — `ReconciliationStateResponse` في الخادم (ق-١٤٣٨). */
export interface ReconciliationStateResponse {
  bankId: string;
  reconciledUntil: string | null;
}

/** ردٌّ — `ReconciliationSuggestionResponse` في الخادم (ق-١٤٣٨). */
export interface ReconciliationSuggestionResponse {
  transactionId: string;
  lineIds: string[];
}

/** ردٌّ — `ReconciliationTotalsResponse` في الخادم (ق-١٤٣٨). */
export interface ReconciliationTotalsResponse {
  unmatchedStatement: string;
  unmatchedStatementCount: number;
  unmatchedLedger: string;
  unmatchedLedgerCount: number;
}

/** ردٌّ — `TakenNumberResponse` في الخادم (ق-١٤٣٨). */
export interface TakenNumberResponse {
  no: string;
  number: number;
  allocatedAt: string;
}

/** ردٌّ — `VoidedCashDepositResponse` في الخادم (ق-١٤٣٨). */
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

/** ردٌّ — `VoidedNetworkSettlementResponse` في الخادم (ق-١٤٣٨). */
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
