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

/** ردٌّ — `PagedPosShiftResponse` في الخادم (ق-١٤٣٨). */
export interface PagedPosShiftResponse {
  items: PosShiftWithTotalsResponse[];
  total: number;
  page: number;
  pageSize: number;
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
  otherId: string | null;
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
