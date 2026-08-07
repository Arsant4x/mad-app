import { apiClient } from './client';

export interface SubscriptionStatus {
  orgName: string;
  status: 'ACTIVE' | 'FROZEN' | 'STOPPED';
  subStart: string | null;
  subEnd: string | null;
  /** Days of paid subscription left (negative once past the end date). */
  daysLeft: number | null;
  inGrace: boolean;
  /** Days of read-only grace remaining before the account stops. */
  graceDaysLeft: number | null;
}

export const getSubscription = () => apiClient.get<SubscriptionStatus>('/subscription').then((r) => r.data);
export const renewSubscription = (months: number) => apiClient.post<SubscriptionStatus>('/subscription/renew', { months }).then((r) => r.data);

/** The company's full data as one JSON document (owner-only; works during the
 * grace period — that is the "export" in "view and export only"). */
export const exportAllData = () => apiClient.get<Record<string, unknown>>('/export').then((r) => r.data);
