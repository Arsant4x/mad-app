// ⛔ مولَّدٌ — لا يُحرَّر بيد.
// المصدرُ: وثيقةُ الواجهة المبنيّة (buildOpenApiDocument بعد nest build) — ما يحمل علامةً سعوديةً منها أو يشير إليها (ق-١٣٥٠: حدُّ الوحدة بالاسم).
// يُعاد توليدُه بـ: npm run openapi:snapshot  (من apps/api)
// والحارسُ خطوةُ openapi:check نفسُها — وصدقُه يشهد به scripts/response-truth.ts على التطبيق المبنيّ.

import type { PosAttemptEvidenceResponse, PosClearanceResponse, PosPaymentRowResponse, PosSaleCustomerResponse, PosSaleLineResponse, PosStockDeductedResponse, PosStockSkippedResponse } from './responses';

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

/** ردٌّ — `PosSaleReceiptResponse` في الخادم (ق-١٤٣٨). */
export interface PosSaleReceiptResponse {
  docType: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'PREPAYMENT';
  status: 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT' | null;
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
  zatcaQr: string | null;
  zatcaStamped: boolean;
}

/** ردٌّ — `PosSaleResponse` في الخادم (ق-١٤٣٨). */
export interface PosSaleResponse {
  docType: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'PREPAYMENT';
  status: 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT' | null;
  stockDeduction: PosStockDeductedResponse | PosStockSkippedResponse;
  stampError: string | null;
  clearance: PosClearanceResponse;
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
  zatcaQr: string | null;
  zatcaStamped: boolean;
}

/** ردٌّ — `PosSyncedSaleResponse` في الخادم (ق-١٤٣٨). */
export interface PosSyncedSaleResponse {
  docType: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'PREPAYMENT';
  status: 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT' | null;
  stockDeduction?: PosStockDeductedResponse | PosStockSkippedResponse;
  stampError?: string | null;
  clearance?: PosClearanceResponse;
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
  zatcaQr: string | null;
  zatcaStamped: boolean;
}
