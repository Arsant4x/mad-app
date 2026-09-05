import { apiClient } from './client';

export type ZatcaOnboardingStatus = 'NOT_STARTED' | 'AWAITING_OTP' | 'COMPLIANCE_ISSUED' | 'PRODUCTION_ISSUED' | 'FAILED';

/** Deliberately carries no key material — only whether each piece exists. The
 * private key and certificates never leave the server. */
export interface ZatcaOnboarding {
  status: ZatcaOnboardingStatus;
  environment: 'SANDBOX' | 'SIMULATION' | 'PRODUCTION';
  hasKeys: boolean;
  hasComplianceCertificate: boolean;
  hasProductionCertificate: boolean;
  onboardedAt: string | null;
  lastError: string | null;
  profileComplete: boolean;
}

export const getZatcaOnboarding = () => apiClient.get<ZatcaOnboarding>('/zatca/onboarding').then((r) => r.data);

export const startZatcaOnboarding = (dto: { environment?: string } = {}) =>
  apiClient.post<ZatcaOnboarding>('/zatca/onboarding/start', dto).then((r) => r.data);

export const submitZatcaOtp = (otp: string) => apiClient.post<ZatcaOnboarding>('/zatca/onboarding/otp', { otp }).then((r) => r.data);

export const requestZatcaProduction = () => apiClient.post<ZatcaOnboarding>('/zatca/onboarding/production').then((r) => r.data);

/** What the submission endpoint returns: the invoice's chain position and the
 * outcome, not the whole invoice. */
export interface ZatcaSubmissionResult {
  id: string;
  no: string;
  zatcaStatus: 'NOT_SUBMITTED' | 'SUBMITTING' | 'STAMPED' | 'CLEARED' | 'REJECTED';
  zatcaUuid: string | null;
  zatcaHash: string | null;
  zatcaPreviousHash: string | null;
  zatcaIcv: number | null;
  zatcaSubmittedAt: string | null;
  zatcaMessage: string | null;
}

export const submitInvoiceToZatca = (invoiceId: string) =>
  apiClient.post<ZatcaSubmissionResult>(`/zatca/invoices/${invoiceId}/submit`).then((r) => r.data);

/** «صادرٌ لم يصل» (ق-١٨٢/٢): ما أُصدر ولم تقبله الهيئة بعد — عدداً وأقدمَ وقائمةً. */
export interface ZatcaUnreported {
  /** مربوطةٌ بشهادة إنتاج — فغيابُ الوصول مخالفةٌ لا حالٌ طبيعي. */
  onboarded: boolean;
  count: number;
  oldestIssueDate: string | null;
  byStatus: Record<string, number>;
  /** أحداثُ إصدارٍ استُنفدت محاولاتها في الطابور — تعود عند الربط. */
  failedQueue: number;
  items: { id: string; no: string; docType: string; issueDate: string; total: string; zatcaStatus: string; zatcaMessage: string | null }[];
}

export const getZatcaUnreported = () => apiClient.get<ZatcaUnreported>('/zatca/unreported').then((r) => r.data);
