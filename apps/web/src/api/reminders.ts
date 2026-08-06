import { apiClient } from './client';

/** How the reminder actually reached the tenant. Recorded because no messaging
 * provider is wired up — the user copies the text and sends it themselves. */
export type ReminderChannel = 'WHATSAPP' | 'SMS' | 'CALL' | 'EMAIL' | 'OTHER';

export interface ReminderPolicy {
  enabled: boolean;
  /** Days of notice before the due date. 0 = on the day. */
  daysBefore: number;
  /** How long before the same tenant may be chased again. */
  repeatEveryDays: number;
  /** Days overdue before the arrear is raised to the manager. Null = off. */
  escalateAfterDays: number | null;
  /** Which company user receives escalations. Null = the account owner. */
  escalateToUserId: string | null;
}

export interface DueReminder {
  installmentId: string;
  contractId: string;
  contractNo: string;
  tenant: string;
  phone: string | null;
  unitNo: string;
  propertyName: string;
  dueDate: string;
  amount: string;
  /** Negative means still upcoming. */
  overdueDays: number;
  lastSentAt: string | null;
  daysSinceLast: number | null;
  /** Already rendered from the company's own template. */
  message: string;
}

export interface DueReminders {
  enabled: boolean;
  policy: ReminderPolicy;
  /** How many are due in total, before the queue was capped. */
  total: number;
  truncated: boolean;
  reminders: DueReminder[];
}

export interface SentReminder {
  id: string;
  channel: ReminderChannel;
  message: string;
  sentAt: string;
}

export const getReminderPolicy = () => apiClient.get<ReminderPolicy>('/reminders/policy').then((r) => r.data);
export const updateReminderPolicy = (dto: Partial<ReminderPolicy>) =>
  apiClient.patch<ReminderPolicy>('/reminders/policy', dto).then((r) => r.data);
export const getDueReminders = () => apiClient.get<DueReminders>('/reminders/due').then((r) => r.data);
export const sendReminder = (installmentId: string, dto: { channel: ReminderChannel; message: string }) =>
  apiClient.post<SentReminder>(`/reminders/installments/${installmentId}/send`, dto).then((r) => r.data);
export const getReminderHistory = (installmentId: string) =>
  apiClient.get<SentReminder[]>(`/reminders/installments/${installmentId}/history`).then((r) => r.data);
