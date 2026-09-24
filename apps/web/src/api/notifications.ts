import { apiClient } from './client';
import type { NotificationKind } from '@mad-app/shared/api/zatca-enums';

/** What the notification is about. Drives both the icon and where clicking it
 * takes you — a free-text title could not do either. */
export type { NotificationKind };

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Screen to open, paired with linkId. Kept apart from a URL so renaming a
   * route doesn't strand old notifications. */
  linkScreen: string | null;
  linkId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  notifications: AppNotification[];
  unread: number;
}

/** What one escalation run did. `remaining` is what the per-run cap held back,
 * so the screen can say "50 raised, 900 still to come" rather than implying the
 * job finished. */
export interface EscalationRun {
  escalated: number;
  threshold: number | null;
  checked?: number;
  remaining?: number;
  skipped?: 'disabled';
}

export const listNotifications = (unreadOnly = false) =>
  apiClient.get<NotificationList>('/notifications', { params: unreadOnly ? { unread: 'true' } : {} }).then((r) => r.data);
export const getUnreadCount = () => apiClient.get<{ unread: number }>('/notifications/unread-count').then((r) => r.data);
export const markNotificationRead = (id: string) => apiClient.patch<AppNotification>(`/notifications/${id}/read`).then((r) => r.data);
export const markAllNotificationsRead = () => apiClient.post<{ marked: number }>('/notifications/read-all').then((r) => r.data);
export const runEscalation = () => apiClient.post<EscalationRun>('/notifications/run-escalation').then((r) => r.data);

/** What one warranty-expiry check did. `raised` new warnings out of `checked`
 * warranties inside the notice window. */
export interface WarrantyCheckRun {
  raised: number;
  checked: number;
  noticeDays: number;
}
export const runWarrantyCheck = () => apiClient.post<WarrantyCheckRun>('/notifications/run-warranty-check').then((r) => r.data);
