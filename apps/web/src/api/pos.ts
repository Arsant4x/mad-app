import type { MoneyText, QtyText } from '../lib/money';
import { apiClient } from './client';
import type { Invoice } from './invoices';
import type { PosCardVerification, PosPaymentAttemptStatus, PosPaymentMethod, PosPaymentResolution } from '@mad-app/shared/api/enums';
import type { PosPaymentPartDto, PosSaleLineDto } from '@mad-app/shared/api/requests';

export type { PosCardVerification, PosPaymentAttemptStatus, PosPaymentMethod, PosPaymentResolution };

export type PosPaymentPart = PosPaymentPartDto;

export interface PosShift {
  id: string;
  branchId: string | null;
  openedById: string;
  openedByName: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  declaredClosing: string | null;
  notes: string | null;
  /** live drawer math — derived server-side from the shift's invoices. ② مالٌ نصّاً بخانتين (`ق-١٢٣٥`): يُقرأ بـ`num()` قبل أي حساب. */
  salesCount: number;
  cashTotal: MoneyText;
  cardTotal: MoneyText;
  expectedCash: MoneyText;
}

export interface ClosedShift extends PosShift {
  /** موجب = زيادة، سالب = عجز — نصٌّ بإشارته (`"-30.00"`). */
  variance: MoneyText;
  /** ⚖️ ما لم يُحسم من عمليات البطاقة — لا يحبس الإقفال، ويُسمّى هنا وينتقل إلى قائمة المطابقة (`ق-١٤١٨`). */
  pendingAttempts: { id: string; status: PosPaymentAttemptStatus; cardAmount: MoneyText; clientSaleId: string; createdAt: string }[];
}

export type PosSaleLine = PosSaleLineDto;

/** مرآة StockDeductionReport في الخادم — معلوماتي فقط، الرصيد يبقى مشتقاً من دفتر الحركات. */
export type StockDeductionReport =
  | {
      deducted: true;
      warehouseId: string;
      movements: number;
      /** بنود هبط رصيدها تحت الصفر — تحذير ناعم بعد البيع، لا مانع. ② كمّيةٌ نصّاً بثلاث خانات. */
      belowZero: { productId: string; resultingQty: QtyText }[];
    }
  | { deducted: false; reason: 'NO_BRANCH_WAREHOUSE' | 'NO_TRACKED_PRODUCTS' };

/**
 * ⑤A4 — الكاملةُ لا تُشارَك قبل الاعتماد: مشترٍ مؤسّسةٌ أو اعتباريٌّ أو مسجَّلٌ ⟵ فاتورةٌ ضريبيةٌ كاملة تُجاز لدى الهيئة
 * قبل التسليم؛ الخادمُ يعيدها بلا رمزٍ ويعلّم `clearance.required` فتحجب الشاشةُ الطباعة.
 */
export interface PosClearance {
  required: boolean;
  status?: string;
  message?: string;
}
export type PosSaleResponse = Invoice & { stockDeduction?: StockDeductionReport; clearance?: PosClearance };

export const getCurrentShift = () => apiClient.get<PosShift | null>('/pos/shifts/current').then((r) => r.data);
export const listShifts = () => apiClient.get<PosShift[]>('/pos/shifts').then((r) => r.data);
export const openShift = (openingFloat: number, branchId?: string) =>
  apiClient.post<PosShift>('/pos/shifts', { openingFloat, branchId }).then((r) => r.data);
// انحرافُ الطرفية لحظةَ الإقفال — فيُؤرَّخ قيدُ التسوية بيوم الكاشير لا بيوم الخادم (ق-٧٣٦)، كما في البيع.
export const closeShift = (id: string, declaredClosing: number, notes?: string) =>
  apiClient
    .post<ClosedShift>(`/pos/shifts/${id}/close`, { declaredClosing, notes, closedOffsetMin: -new Date().getTimezoneOffset() })
    .then((r) => r.data);
export const createPosSale = (lines: PosSaleLine[], paymentMethod: PosPaymentMethod, customerId?: string) =>
  apiClient.post<PosSaleResponse>('/pos/sales', { lines, paymentMethod, customerId }).then((r) => r.data);

/** وقائعُ الانقطاع المستنتَجة على الخادم (ق-١٩٢/ج · ق-٢٠١) — استنتاجٌ لا قياس، وحدُّه ظاهر. */
export interface PosOfflineIncidents {
  inferred: true;
  gapMinutes: number;
  items: { id: string; startedAt: string; endedAt: string; firstSyncedAt: string; gapMinutes: number; durationMinutes: number; salesCount: number }[];
}
export const getPosIncidents = () => apiClient.get<PosOfflineIncidents>('/pos/incidents').then((r) => r.data);

/** البيعُ كما يُرسَل — بهويّة الطرفية ولحظة الرنّ. */
export interface PosSaleInput {
  clientSaleId: string;
  offlineRef?: string;
  ringAt?: string;
  ringOffsetMin?: number;
  lines: PosSaleLine[];
  paymentMethod: PosPaymentMethod;
  payments?: PosPaymentPart[];
  customerId?: string;
}

/**
 * مزامنة بيع أوفلاين — idempotent على clientSaleId: التكرار يعيد نفس الفاتورة.
 * ⚖️ `ق-١٣٩٧`: والربطُ فعّال، جزءُ البطاقة **يحمل رقمَ مرجع الجهاز من إيصاله** — لا يُقبل بتأكيد الكاشير وحدَه.
 */
export const syncPosSale = (sale: PosSaleInput & { cardDeviceReference?: string }) => apiClient.post<PosSaleResponse>('/pos/sales/sync', sale).then((r) => r.data);

// ───────── محاولةُ دفع البطاقة (`ق-١٤٠١` · `ق-١٣٩٧` … `ق-١٣٩٩`) ─────────

/** أفعّالٌ ربطُ بوابة الدفع — يقرّر المسار: محاولةٌ عبر المزوّد، أو بيعٌ مباشر. */
export interface PosPaymentMode {
  active: boolean;
  provider?: string;
  /** مهلةُ جهاز المحوّل بالمللي ثانية (`ق-١٣٩٨`) — تعرضها الشاشة وهي تنتظر. */
  deadlineMs?: number;
}
export const getPaymentMode = () => apiClient.get<PosPaymentMode>('/pos/payment-mode').then((r) => r.data);

export interface PosPaymentAttempt {
  id: string;
  status: PosPaymentAttemptStatus;
  clientSaleId: string;
  shiftId: string;
  /** ② مالٌ نصّاً بخانتين. */
  cardAmount: MoneyText;
  total: MoneyText | null;
  paymentMethod: PosPaymentMethod | null;
  currency: string;
  provider: string;
  providerRef: string | null;
  approvalCode: string | null;
  declineReason: string | null;
  /** سببُ التعليق أو آخرُ جوابٍ غير قاطع. */
  detail: string | null;
  invoiceId: string | null;
  chargeStartedAt: string | null;
  resolvedAt: string | null;
  resolution: PosPaymentResolution | null;
  resolvedByName: string | null;
  evidence: { deviceReference: string | null; approvalCode: string | null; note: string | null } | null;
  createdAt: string;
  /** إيصالُ البيع حين اكتملت. */
  sale?: PosSaleResponse | null;
  /** في القائمة المفتوحة: اسمُ الكاشير صاحب المناوبة. */
  cashierName?: string;
}

export const createPaymentAttempt = (sale: PosSaleInput) => apiClient.post<PosPaymentAttempt>('/pos/payment-attempts', sale).then((r) => r.data);
export const chargePaymentAttempt = (id: string) => apiClient.post<PosPaymentAttempt>(`/pos/payment-attempts/${id}/charge`).then((r) => r.data);
export const getPaymentAttempt = (id: string) => apiClient.get<PosPaymentAttempt>(`/pos/payment-attempts/${id}`).then((r) => r.data);
export const listOpenPaymentAttempts = () => apiClient.get<PosPaymentAttempt[]>('/pos/payment-attempts').then((r) => r.data);
/** الحسمُ بجواب المزوّد بالمرجع — «جوابُ المزوّد أوّلاً» (`ق-١٣٩٩`). */
export const resolvePaymentAttempt = (id: string) => apiClient.post<PosPaymentAttempt>(`/pos/payment-attempts/${id}/resolve`).then((r) => r.data);
/** ⚖️ الحسمُ اليدويّ بدليلٍ — لصاحب صلاحية المراجعة (`ق-١٣٩٩`). */
export const resolvePaymentAttemptWithEvidence = (id: string, evidence: { deviceReference: string; approvalCode: string; note?: string }) =>
  apiClient.post<PosPaymentAttempt>(`/pos/payment-attempts/${id}/resolve-with-evidence`, evidence).then((r) => r.data);
export const cancelPaymentAttempt = (id: string) => apiClient.post<PosPaymentAttempt>(`/pos/payment-attempts/${id}/cancel`).then((r) => r.data);

/** ⚖️ دفعاتُ البطاقة غيرُ المتحقَّقة (`ق-١٣٩٧`/٢–٣) — للمراجعة، باسم الكاشير وبحال المطابقة. */
export interface CardVerificationRow {
  posPaymentId: string;
  invoiceId: string;
  invoiceNo: string;
  issueDate: string;
  amount: MoneyText;
  verification: PosCardVerification;
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
/**
 * ⚖️ **معلّقٌ من مناوبةٍ مقفلة** (`ق-١٤١٨`): أُقفلت المناوبةُ وهو فيها مسمّىً، وينتقل إلى قائمة المطابقة حتى يحسمه جوابُ المزوّد
 * أو الدليل — لا بيعَ يُسجَّل له ولا يُرفض بالتخمين.
 */
export interface UnresolvedAttemptRow {
  attemptId: string;
  status: PosPaymentAttemptStatus;
  amount: MoneyText;
  provider: string;
  createdAt: string;
  detail: string | null;
  cashierName: string | null;
  shiftClosedAt: string | null;
}
export interface CardVerificationList {
  settlementDays: number;
  items: CardVerificationRow[];
  unresolvedAttempts: UnresolvedAttemptRow[];
}
export const listCardVerifications = (state: 'open' | 'overdue' | 'matched' | 'all' = 'open') =>
  apiClient.get<CardVerificationList>('/pos/card-verifications', { params: { state } }).then((r) => r.data);
