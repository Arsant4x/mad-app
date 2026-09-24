import { apiClient } from './client';
import { PLATFORM_DECISION_ACTION_VALUES } from '@mad-app/shared/api/enums';
import type { PlatformDecisionAction, PlatformDecisionStatus } from '@mad-app/shared/api/enums';

/**
 * **القراراتُ المنصّية الحرجة** (`ق-١٣١٨` · ⑪A1) — الفعلُ الذي لا يُردّ **بيدين لا بيد**.
 * والأفعالُ مرسومةٌ من `PlatformDecisionAction` في الخادم.
 */
export const PLATFORM_DECISION_ACTIONS = PLATFORM_DECISION_ACTION_VALUES;
export type { PlatformDecisionAction };
export type { PlatformDecisionStatus };

export interface PlatformDecision {
  id: string;
  action: PlatformDecisionAction;
  status: PlatformDecisionStatus;
  targetId: string;
  summary: string;
  requestedAt: string;
  decidedAt: string | null;
  executedAt: string | null;
  note: string | null;
  requestedBy: { displayName: string };
  decidedBy: { displayName: string } | null;
}

export const listPlatformDecisions = (status?: PlatformDecisionStatus) =>
  apiClient.get<PlatformDecision[]>('/admin/decisions', { params: status ? { status } : {} }).then((r) => r.data);

export const requestPlatformDecision = (dto: { action: PlatformDecisionAction; targetId: string; summary: string }) =>
  apiClient.post<PlatformDecision>('/admin/decisions', dto).then((r) => r.data);

/** ⚠️ **ومن طلبه لا يُقرّه** — الخادمُ يردّ `409`، والقاعدةُ تردّه كذلك. */
export const decidePlatformDecision = (id: string, approve: boolean, note?: string) =>
  apiClient.post<PlatformDecision>(`/admin/decisions/${id}/${approve ? 'approve' : 'reject'}`, { note }).then((r) => r.data);
