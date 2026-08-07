import { apiClient } from './client';

export type IntegrationKind = 'PAYMENT_GATEWAY' | 'BNPL' | 'ECOMMERCE';

export interface IntegrationConnection {
  id: string;
  kind: IntegrationKind;
  provider: string;
  label: string | null;
  enabled: boolean;
  /** مقنَّعة دائماً («•••• آخر 4») — القيم الكاملة لا تغادر الخادم. */
  credentials: Record<string, string>;
  createdAt: string;
}

export const KIND_LABELS: Record<IntegrationKind, string> = {
  PAYMENT_GATEWAY: 'بوابة دفع (أجهزة الكاشير)',
  BNPL: 'الدفع بالتقسيط',
  ECOMMERCE: 'متجر إلكتروني',
};

/** المتاح اليوم لكل نوع — يتوسّع بمزوّد حقيقي عند توفر مفاتيحه. */
export const PROVIDERS_BY_KIND: Record<IntegrationKind, { value: string; label: string }[]> = {
  PAYMENT_GATEWAY: [{ value: 'MOCK', label: 'مزوّد تجريبي (Mock)' }],
  BNPL: [{ value: 'MOCK', label: 'مزوّد تجريبي (Mock)' }],
  ECOMMERCE: [{ value: 'MOCK', label: 'مزوّد تجريبي (Mock)' }],
};

export const listIntegrations = () => apiClient.get<IntegrationConnection[]>('/integrations').then((r) => r.data);
export const createIntegration = (dto: { kind: IntegrationKind; provider: string; label?: string; credentials: Record<string, string> }) =>
  apiClient.post<IntegrationConnection>('/integrations', dto).then((r) => r.data);
export const setIntegrationEnabled = (id: string, enabled: boolean) =>
  apiClient.patch<IntegrationConnection>(`/integrations/${id}/enabled`, { enabled }).then((r) => r.data);
export const deleteIntegration = (id: string) => apiClient.delete(`/integrations/${id}`);
