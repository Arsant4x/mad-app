import { apiClient } from './client';
import type { PosCardVerification, PosPaymentAttemptStatus, PosPaymentMethod, PosPaymentResolution } from '@mad-app/shared/api/enums';
import type { PosPaymentPartDto, PosSaleLineDto } from '@mad-app/shared/api/requests';
import type {
  PosCardVerificationListResponse,
  PosCardVerificationRowResponse,
  PosClearanceResponse,
  PosClosedShiftResponse,
  PosIncidentsResponse,
  PosPaymentAttemptResponse,
  PosPaymentModeResponse,
  PosShiftResponse,
  PosShiftWithTotalsResponse,
  PosStockDeductedResponse,
  PosStockSkippedResponse,
  PosUnresolvedAttemptRowResponse,
} from '@mad-app/shared/api/responses';
// ⚖️ إيصالُ البيع يحمل رمزَ الإيصال (اسمُه على السلك سعوديّ) فيسكن ملفَّ الوحدة المولَّد — الحدُّ الوحيد هنا، دَينٌ معلَن (`§3.8` · `ق-١٤٣٨`).
import type { PosSaleReceiptResponse, PosSaleResponse as SoldSaleResponse, PosSyncedSaleResponse } from '@mad-app/shared/api/zatca-responses';

export type { PosCardVerification, PosPaymentAttemptStatus, PosPaymentMethod, PosPaymentResolution };

export type PosPaymentPart = PosPaymentPartDto;

/**
 * ⚖️ **أنواعُ الردّ مولَّدةٌ لا مكتوبةٌ بيد** (`ق-١٤٣٨` · خطّةُ الأنواع ④ — أوّلُ وحدةٍ الكاشير): الأسماءُ هنا **استعارةٌ** لأصناف الخادم،
 * وصدقُها يشهد به حارسُ الصدق الحيّ على التطبيق المبنيّ (`scripts/response-truth.ts`) — لا هذا الملفّ.
 * والمالُ نصٌّ بخانتين كما يُرسَل (`MoneyText`) يُقرأ بـ`num()` قبل أي حساب (`ق-١٢٣٥`).
 */
/** المناوبةُ الحالية وفي القائمة — بمجاميع درجها المشتقّة. */
export type PosShift = PosShiftWithTotalsResponse;
/** ردُّ الإقفال — الفرقُ نصّاً بإشارته، وما لم يُحسم من البطاقة مسمّىً (`ق-١٤١٨`). */
export type ClosedShift = PosClosedShiftResponse;

export type PosSaleLine = PosSaleLineDto;

/** تقريرُ الخصم — اتّحادٌ مميَّزٌ بـ`deducted` كما في الخادم؛ معلوماتيٌّ والرصيدُ من دفتر الحركات. */
export type StockDeductionReport = PosStockDeductedResponse | PosStockSkippedResponse;

/** ⑤A4 — الكاملةُ لا تُشارَك قبل الاعتماد: `clearance.required` يحجب الطباعة. */
export type PosClearance = PosClearanceResponse;
/**
 * **الإيصالُ الذي تحمله الشاشة** — من البيع المباشر (الثلاثةُ حاضرة) أو المزامنة (غائبةٌ في الإعادة) أو محاولةٍ اكتملت (غائبة):
 * فالخصمُ والختمُ والإجازةُ اختياريّة هنا بحكم أوسع المسارات.
 */
export type PosSaleResponse = PosSyncedSaleResponse;

export const getCurrentShift = () => apiClient.get<PosShift | null>('/pos/shifts/current').then((r) => r.data);
export const listShifts = () => apiClient.get<PosShift[]>('/pos/shifts').then((r) => r.data);
// الفتحُ يعيد أعمدةَ المناوبة بلا مجاميع — والنوعُ المكتوبُ بيدٍ كان يعلنها (`ق-١٤٣٨`).
export const openShift = (openingFloat: number, branchId?: string) =>
  apiClient.post<PosShiftResponse>('/pos/shifts', { openingFloat, branchId }).then((r) => r.data);
// انحرافُ الطرفية لحظةَ الإقفال — فيُؤرَّخ قيدُ التسوية بيوم الكاشير لا بيوم الخادم (ق-٧٣٦)، كما في البيع.
export const closeShift = (id: string, declaredClosing: number, notes?: string) =>
  apiClient
    .post<ClosedShift>(`/pos/shifts/${id}/close`, { declaredClosing, notes, closedOffsetMin: -new Date().getTimezoneOffset() })
    .then((r) => r.data);
export const createPosSale = (lines: PosSaleLine[], paymentMethod: PosPaymentMethod, customerId?: string) =>
  apiClient.post<SoldSaleResponse>('/pos/sales', { lines, paymentMethod, customerId }).then((r) => r.data);

/** وقائعُ الانقطاع المستنتَجة على الخادم (ق-١٩٢/ج · ق-٢٠١) — استنتاجٌ لا قياس، وحدُّه ظاهر. */
export type PosOfflineIncidents = PosIncidentsResponse;
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

/** أفعّالٌ ربطُ بوابة الدفع — يقرّر المسار: محاولةٌ عبر المزوّد، أو بيعٌ مباشر؛ ومهلةُ الجهاز بالمللي ثانية (`ق-١٣٩٨`). */
export type PosPaymentMode = PosPaymentModeResponse;
export const getPaymentMode = () => apiClient.get<PosPaymentMode>('/pos/payment-mode').then((r) => r.data);

/**
 * المحاولةُ كما تحملها الشاشة — نوعٌ واحدٌ لمساراتٍ تختلف: الإنشاءُ بلا إيصال، والقراءةُ والشحنُ والحسمُ والإلغاءُ بإيصال البيع
 * (`null` ما لم تكتمل)، والقائمةُ المفتوحةُ باسم الكاشير — فالاثنان اختياريّان هنا بحكم أوسعها.
 */
export type PosPaymentAttempt = PosPaymentAttemptResponse & { sale?: PosSaleReceiptResponse | null; cashierName?: string };

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
export type CardVerificationRow = PosCardVerificationRowResponse;
/**
 * ⚖️ **معلّقٌ من مناوبةٍ مقفلة** (`ق-١٤١٨`): أُقفلت المناوبةُ وهو فيها مسمّىً، وينتقل إلى قائمة المطابقة حتى يحسمه جوابُ المزوّد
 * أو الدليل — لا بيعَ يُسجَّل له ولا يُرفض بالتخمين.
 */
export type UnresolvedAttemptRow = PosUnresolvedAttemptRowResponse;
export type CardVerificationList = PosCardVerificationListResponse;
export const listCardVerifications = (state: 'open' | 'overdue' | 'matched' | 'all' = 'open') =>
  apiClient.get<CardVerificationList>('/pos/card-verifications', { params: { state } }).then((r) => r.data);
