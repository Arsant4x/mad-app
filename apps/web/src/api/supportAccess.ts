import { apiClient } from './client';

export type SupportGrantStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'REVOKED';

export interface SupportGrant {
  id: string;
  companyId: string;
  requestedByName: string;
  reason: string;
  durationMinutes: number;
  /** نطاقُ ما يُرى — شاشاتٌ يختارها الطالب ويراها المالك قبل قراره (ق-٥٢٧). */
  screens: string[];
  status: SupportGrantStatus;
  requestedAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
  /** جانب المالك فقط: محسوبة لحظة القراءة. */
  active?: boolean;
  /** اسمُ المنشأة لحظةَ الطلب — يبقى بعد حذفها (ق-٥٣١). */
  companyName: string;
}

export interface SupportLogLine {
  id: string;
  method: string;
  path: string;
  at: string;
  /** من دخل فعلاً (ق-٥٢٨) — لا طالبُ الإذن الذي يحمله `grant`. */
  actorName: string;
  grant: { requestedByName: string; reason: string };
}

// ---- جانب مدير المنصة ----
export const adminListSupportGrants = () => apiClient.get<SupportGrant[]>('/support-access/admin').then((r) => r.data);
export const requestSupportAccess = (companyId: string, reason: string, durationMinutes: number, screens: string[]) =>
  apiClient.post<SupportGrant>('/support-access/admin', { companyId, reason, durationMinutes, screens }).then((r) => r.data);

// ---- جانب مالك المنشأة ----
export const ownerSupportOverview = () => apiClient.get<SupportGrant[]>('/support-access').then((r) => r.data);
export const ownerSupportLog = () => apiClient.get<SupportLogLine[]>('/support-access/log').then((r) => r.data);
export const approveSupport = (id: string) => apiClient.post<SupportGrant>(`/support-access/${id}/approve`).then((r) => r.data);
export const denySupport = (id: string) => apiClient.post<SupportGrant>(`/support-access/${id}/deny`).then((r) => r.data);
export const revokeSupport = (id: string) => apiClient.post<SupportGrant>(`/support-access/${id}/revoke`).then((r) => r.data);
