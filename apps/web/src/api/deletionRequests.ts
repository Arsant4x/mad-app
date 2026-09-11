import { apiClient } from './client';

export type DeletionRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface DeletionRequest {
  id: string;
  reason: string | null;
  status: DeletionRequestStatus;
  decidedAt: string | null;
  decidedNote: string | null;
  createdAt: string;
}

export interface AdminDeletionRequest extends DeletionRequest {
  companyId: string;
  /** اسمُ المنشأة وقتَ الطلب — على الصفّ نفسه، فيبقى بعد حذفها (ق-٥٣٧). */
  companyName: string;
  /** من قرّر — مديرُ المنصّة الذي وافق أو رفض. */
  decidedByName: string | null;
}

// Merchant side
export const getMyDeletionRequest = () => apiClient.get<DeletionRequest | null>('/deletion-request').then((r) => r.data);
export const submitDeletionRequest = (reason?: string) => apiClient.post<DeletionRequest>('/deletion-request', { reason }).then((r) => r.data);
export const cancelDeletionRequest = (id: string) => apiClient.post<DeletionRequest>(`/deletion-request/${id}/cancel`).then((r) => r.data);

// Support side
export const listDeletionRequests = () => apiClient.get<AdminDeletionRequest[]>('/admin/deletion-requests').then((r) => r.data);
export const rejectDeletionRequest = (id: string, note?: string) => apiClient.post<AdminDeletionRequest>(`/admin/deletion-requests/${id}/reject`, { note }).then((r) => r.data);
export const approveDeletionRequest = (id: string, note?: string) =>
  apiClient.post<{ executed: boolean; companyId: string; orgName: string }>(`/admin/deletion-requests/${id}/approve`, { note }).then((r) => r.data);
