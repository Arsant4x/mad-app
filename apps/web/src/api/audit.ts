import { apiClient } from './client';

export interface AuditEntry {
  id: string;
  actorType: 'COMPANY' | 'COMPANY_USER';
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

export interface AuditFilters {
  actorId?: string;
  screen?: string;
  entityId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export const listAuditLog = (filters: AuditFilters = {}) =>
  apiClient
    .get<AuditEntry[]>('/audit-log', {
      params: Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== '')),
    })
    .then((r) => r.data);
