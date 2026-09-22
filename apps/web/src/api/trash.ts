import { apiClient } from './client';

export interface TrashItem {
  id: string;
  /** The record's own name — you have to know what you're restoring. */
  name: string;
  deletedAt: string;
  /** Days before it is purged for good — or before the statutory retention ends, whichever is later. */
  daysLeft: number;
  /** ما تحت الحفظ النظاميّ (`ق-١٢٧١`/أ): لا يُمحى قبل هذا اليوم — `null` إن لم يشر إليه سجلّ. */
  retainedUntil: string | null;
  /** أسماءُ السجلّات التي تحفظه (فواتير · بنود فواتير · بلاغات صيانة …). */
  retainedBy: string[];
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
