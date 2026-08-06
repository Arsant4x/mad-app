import { apiClient } from './client';

/** Urgent is a habitability/liability issue (a burst pipe, a failed lift), not
 * a mood — which is why it is ranked rather than left to a note. */
export type MaintenancePriority = 'URGENT' | 'HIGH' | 'NORMAL';

/** DONE and CLOSED are distinct on purpose: the contractor says it's finished,
 * the landlord confirms it actually is. */
export type MaintenanceStatus = 'REPORTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'CLOSED' | 'CANCELLED';

export interface MaintenanceRequest {
  id: string;
  propertyId: string;
  property: { id: string; name: string };
  unitId: string | null;
  unit: { id: string; unitNo: string } | null;
  title: string;
  description: string | null;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  reportedBy: string | null;
  reportedAt: string;
  assignedTo: string | null;
  startedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  cancelReason: string | null;
  cost: string | null;
  currency: string;
  /** Null when the work cost nothing, or when the ledger accounts are missing. */
  journalEntryId: string | null;
  notes: string | null;
}

export interface CreateMaintenanceInput {
  propertyId: string;
  unitId?: string;
  title: string;
  description?: string;
  priority?: MaintenancePriority;
  reportedBy?: string;
  reportedAt: string;
}

export interface UpdateMaintenanceInput {
  title?: string;
  description?: string;
  priority?: MaintenancePriority;
  reportedBy?: string;
  notes?: string;
}

export const listMaintenance = () => apiClient.get<MaintenanceRequest[]>('/maintenance').then((r) => r.data);
export const createMaintenance = (dto: CreateMaintenanceInput) => apiClient.post<MaintenanceRequest>('/maintenance', dto).then((r) => r.data);
export const updateMaintenance = (id: string, dto: UpdateMaintenanceInput) =>
  apiClient.patch<MaintenanceRequest>(`/maintenance/${id}`, dto).then((r) => r.data);

/** Each step is its own call rather than a status field: they carry different
 * data, and a free-form status would let the queue be jumped. */
export const assignMaintenance = (id: string, assignedTo: string) =>
  apiClient.post<MaintenanceRequest>(`/maintenance/${id}/assign`, { assignedTo }).then((r) => r.data);
export const startMaintenance = (id: string, startedAt: string) =>
  apiClient.post<MaintenanceRequest>(`/maintenance/${id}/start`, { startedAt }).then((r) => r.data);
export const completeMaintenance = (id: string, dto: { completedAt: string; cost?: number; notes?: string }) =>
  apiClient.post<MaintenanceRequest>(`/maintenance/${id}/complete`, dto).then((r) => r.data);
export const closeMaintenance = (id: string, closedAt: string) =>
  apiClient.post<MaintenanceRequest>(`/maintenance/${id}/close`, { closedAt }).then((r) => r.data);
export const cancelMaintenance = (id: string, cancelReason: string) =>
  apiClient.post<MaintenanceRequest>(`/maintenance/${id}/cancel`, { cancelReason }).then((r) => r.data);
