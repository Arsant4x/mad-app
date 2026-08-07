import { apiClient } from './client';

export interface TrashItem {
  id: string;
  /** The record's own name — you have to know what you're restoring. */
  name: string;
  deletedAt: string;
  /** Days before it is purged for good. */
  daysLeft: number;
}

export interface TrashGroup {
  entity: string;
  label: string;
  items: TrashItem[];
}

export interface TrashList {
  retentionDays: number;
  groups: TrashGroup[];
}

export const listTrash = () => apiClient.get<TrashList>('/trash').then((r) => r.data);
export const restoreFromTrash = (entity: string, id: string) => apiClient.post(`/trash/${entity}/${id}/restore`).then((r) => r.data);
export const purgeFromTrash = (entity: string, id: string) => apiClient.delete(`/trash/${entity}/${id}`);
