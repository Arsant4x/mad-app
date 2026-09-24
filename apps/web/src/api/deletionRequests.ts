import { apiClient } from './client';
import type { AccountStatus } from './client';
import type { AccountRequestKind, AccountRequestOutcome, DeletionRequestStatus } from '@mad-app/shared/api/enums';

export type { DeletionRequestStatus };
/** نوعُ الطلب: حذفٌ — أو إعادةُ فتحٍ لحسابٍ مغلق (ق-٥٤٨) — أو إتلافٌ صريحٌ لغير الملزِم (ق-٥٥٩). */
export type { AccountRequestKind };
/** ما وقع بالموافقة (ق-٥٤٢): حُذفت (بلا حركة) · أُغلقت (لها حركة) · أُعيد فتحُها · مُحي غيرُ الملزِم. */
export type { AccountRequestOutcome };

export interface DeletionRequest {
  id: string;
  kind: AccountRequestKind;
  reason: string | null;
  status: DeletionRequestStatus;
  outcome: AccountRequestOutcome | null;
  /** الحركةُ التي أوجبت الإغلاقَ — بأسمائها، على القرار نفسه. */
  movement: string[];
  decidedAt: string | null;
  decidedNote: string | null;
  createdAt: string;
}

/** ما يراه مديرُ المنصّة قبل الموافقة — الحقيقةُ قبل الضغطة: أتُحذف أم تُغلَق، ولماذا. */
export interface DecisionPreview {
  outcome: 'DELETE' | 'CLOSE';
  movement: string[];
}

export interface AdminDeletionRequest extends DeletionRequest {
  companyId: string;
  /** اسمُ المنشأة وقتَ الطلب — على الصفّ نفسه، فيبقى بعد حذفها (ق-٥٣٧). */
  companyName: string;
  /** من قرّر — مديرُ المنصّة الذي وافق أو رفض. */
  decidedByName: string | null;
  /** على طلبات الحذف المعلَّقة فقط. */
  preview?: DecisionPreview;
}

/** حالُ الحساب للتاجر — يُقرأ وهو مغلق (ق-٥٤٧): وحتى متى تُقبل العودة، وهل مُحي غيرُ الملزِم (ق-٥٥٩). */
export interface AccountClosureState {
  status: AccountStatus;
  closedAt: string | null;
  retainUntil: string | null;
  reopenUntil: string | null;
  erasedAt: string | null;
}

export interface ApprovalResult {
  executed: boolean;
  outcome: AccountRequestOutcome;
  companyId: string;
  orgName: string;
  movement: string[];
  retainUntil: string | null;
}

/** نسخةُ الإغلاق (ق-٥٥٤): ملفّاتٌ سنوية + الأساسية + المختومُ كما هو، بروابطَ موقَّعةٍ قصيرة العمر. */
export interface ClosureArchive {
  producedAt: string;
  expiresAt: string;
  years: number[];
  totalRows: number;
  stampedInvoices: number;
  files: { name: string; bytes: number; sha256: string; url: string; expiresInSeconds: number }[];
}

// Merchant side
export const getMyDeletionRequest = () => apiClient.get<DeletionRequest | null>('/deletion-request').then((r) => r.data);
export const getClosureArchive = () => apiClient.get<ClosureArchive>('/deletion-request/archive').then((r) => r.data);
export const getAccountClosureState = () => apiClient.get<AccountClosureState>('/deletion-request/account').then((r) => r.data);
export const submitDeletionRequest = (reason?: string) => apiClient.post<DeletionRequest>('/deletion-request', { reason }).then((r) => r.data);
export const requestReopening = () => apiClient.post<DeletionRequest>('/deletion-request/reopen').then((r) => r.data);
/** طلبُ إتلافٍ صريح (ق-٥٥٩): محوُ غير الملزِم الآن — ويُغلق نافذةَ العودة. */
export const requestErasure = () => apiClient.post<DeletionRequest>('/deletion-request/erase').then((r) => r.data);
export const cancelDeletionRequest = (id: string) => apiClient.post<DeletionRequest>(`/deletion-request/${id}/cancel`).then((r) => r.data);

// Support side
export const listDeletionRequests = () => apiClient.get<AdminDeletionRequest[]>('/admin/deletion-requests').then((r) => r.data);
export const rejectDeletionRequest = (id: string, note?: string) => apiClient.post<AdminDeletionRequest>(`/admin/deletion-requests/${id}/reject`, { note }).then((r) => r.data);
export const approveDeletionRequest = (id: string, note?: string) =>
  apiClient.post<ApprovalResult>(`/admin/deletion-requests/${id}/approve`, { note }).then((r) => r.data);
