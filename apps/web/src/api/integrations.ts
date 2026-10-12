import { apiClient } from './client';
import type { IntegrationKind } from '@mad-app/shared/api/enums';
import { labelTable } from '../lib/labelTable';

export type { IntegrationKind };

export interface IntegrationConnection {
  id: string;
  kind: IntegrationKind;
  provider: string;
  label: string | null;
  enabled: boolean;
  /** Always masked ("•••• last 4"); full values never leave the server. */
  credentials: Record<string, string>;
  createdAt: string;
}

export const KIND_LABELS: Record<IntegrationKind, string> = labelTable('labels.integration_kinds', ['PAYMENT_GATEWAY', 'BNPL', 'ECOMMERCE']);

/**
 * Real providers available to the merchant: empty on purpose today.
 *
 * A test provider shown here once was a financial hole, not a cosmetic gap: its adapter approved every
 * card payment without collecting money, so invoices were stamped paid with no cash. It was removed from
 * the interface and is rejected by the server when `NODE_ENV=production` (`integrations.service.ts`).
 *
 * Only a provider that really collects money is listed here. As soon as one exists the section shows by
 * itself; nothing else needs changing.
 */
export const PROVIDERS_BY_KIND: Record<IntegrationKind, { value: string; label: string }[]> = {
  PAYMENT_GATEWAY: [],
  BNPL: [],
  ECOMMERCE: [],
};

/** Is there at least one real provider? Decides whether the connections section shows. */
export const hasAnyProvider = (): boolean =>
  Object.values(PROVIDERS_BY_KIND).some((list) => list.length > 0);

export const listIntegrations = () => apiClient.get<IntegrationConnection[]>('/integrations').then((r) => r.data);
export const createIntegration = (dto: { kind: IntegrationKind; provider: string; label?: string; credentials: Record<string, string> }) =>
  apiClient.post<IntegrationConnection>('/integrations', dto).then((r) => r.data);
export const setIntegrationEnabled = (id: string, enabled: boolean) =>
  apiClient.patch<IntegrationConnection>(`/integrations/${id}/enabled`, { enabled }).then((r) => r.data);
export const deleteIntegration = (id: string) => apiClient.delete(`/integrations/${id}`);
