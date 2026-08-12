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

/**
 * المزوّدون **الحقيقيون** المتاحون للتاجر — فارغة اليوم عمداً.
 *
 * ⚠️ كان هنا `MOCK` معروضاً باسم «مزوّد تجريبي (Mock)» **كخيارٍ وحيد**. وهو
 * ليس نقصاً تجميلياً بل **ثغرة مالية**: محوّله يعتمد كل عملية بطاقة بلا
 * تحصيل، فتُختم الفواتير مسدَّدة بلا مال. أُزيل من الواجهة، ورُفض في الخادم
 * حين `NODE_ENV=production` (`integrations.service.ts`).
 *
 * **قاعدة الإضافة:** لا يُدرَج هنا إلا مزوّد يُحصّل مالاً فعلاً. وبمجرد
 * وجود واحد يظهر القسم من تلقائه — لا شيء آخر يحتاج تعديلاً.
 */
export const PROVIDERS_BY_KIND: Record<IntegrationKind, { value: string; label: string }[]> = {
  PAYMENT_GATEWAY: [],
  BNPL: [],
  ECOMMERCE: [],
};

/** هل يوجد مزوّد حقيقي واحد على الأقل؟ يحسم عرض قسم الربط من إخفائه. */
export const hasAnyProvider = (): boolean =>
  Object.values(PROVIDERS_BY_KIND).some((list) => list.length > 0);

export const listIntegrations = () => apiClient.get<IntegrationConnection[]>('/integrations').then((r) => r.data);
export const createIntegration = (dto: { kind: IntegrationKind; provider: string; label?: string; credentials: Record<string, string> }) =>
  apiClient.post<IntegrationConnection>('/integrations', dto).then((r) => r.data);
export const setIntegrationEnabled = (id: string, enabled: boolean) =>
  apiClient.patch<IntegrationConnection>(`/integrations/${id}/enabled`, { enabled }).then((r) => r.data);
export const deleteIntegration = (id: string) => apiClient.delete(`/integrations/${id}`);
