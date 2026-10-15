import { apiClient } from './client';
import type { AuditListQuery } from '@mad-app/shared/api/requests';

export interface AuditEntry {
  id: string;
  /** PLATFORM_ADMIN: a platform administrator acted on this company from the platform side. */
  actorType: 'COMPANY' | 'COMPANY_USER' | 'PLATFORM_ADMIN';
  actorId: string;
  actorName: string;
  screen: string;
  action: string;
  entity: string;
  entityId: string | null;
  /** A ready-to-read Arabic sentence built server-side (SPEC 12.2). */
  summary: string;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export type AuditFilters = AuditListQuery;

export const listAuditLog = (filters: AuditFilters = {}) =>
  apiClient
    .get<AuditEntry[]>('/audit-log', {
      params: Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== '')),
    })
    .then((r) => r.data);
