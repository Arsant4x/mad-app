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
