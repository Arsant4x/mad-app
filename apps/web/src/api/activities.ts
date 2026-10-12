import { apiClient } from './client';
import { SECTOR_VALUES } from '@mad-app/shared/api/enums';
import type { Sector } from '@mad-app/shared/api/enums';
import type { CreateActivityDto } from '@mad-app/shared/api/requests';
import { translateTable } from '../lib/labelTable';

/** Sectors, generated from `apps/api/src/activities/sectors.ts` in the source order. */
export const SECTORS = SECTOR_VALUES;
export type { Sector };

/**
 * Sector names. The Arabic below is compared word for word with the server's list
 * (`apps/api/src/activities/sectors-mirror.spec.ts`); the text shown comes from `labels.sectors`.
 */
export const SECTOR_LABELS: Record<Sector, string> = {
  REALESTATE: 'مكتب عقاري', // i18n-exempt: Arabic mirror compared with the server list
  RESTAURANT: 'مطعم أو كافيه', // i18n-exempt: Arabic mirror compared with the server list
  RETAIL: 'تجزئة', // i18n-exempt: Arabic mirror compared with the server list
  PHARMACY: 'صيدلية', // i18n-exempt: Arabic mirror compared with the server list
  CONTRACTING: 'مقاولات', // i18n-exempt: Arabic mirror compared with the server list
  FREELANCE: 'عمل حرّ', // i18n-exempt: Arabic mirror compared with the server list
  OTHER: 'أخرى', // i18n-exempt: Arabic mirror compared with the server list
};
translateTable(SECTOR_LABELS, 'labels.sectors');

export interface Activity {
  id: string;
  name: string;
  activityType: string | null;
  /** The sector confirmed by the owner; screen filtering uses this one only. */
  sector: Sector | null;
  /**
   * What automatic matching suggested: a suggestion, not a decision. It is shown for the owner to
   * confirm or change and never used in any calculation, so "suggested" and "confirmed" stay apart.
   */
  sectorSuggested: Sector | null;
  /** Disabled, not deleted: its screens disappear and its data stays. */
  disabledAt: string | null;
  /** How many branches/products point at this activity — the screen uses these
   * to explain the delete guard before the button is pressed. */
  branchCount: number;
  productCount: number;
}

export type ActivityInput = CreateActivityDto;

/** Disabling is an update, not a create: `CreateActivityDto` has no `disabled` and the server answers `400`. */
export interface ActivityUpdateInput extends Partial<ActivityInput> {
  disabled?: boolean;
}

/** Screens that will hide and show, computed by the server; the screen only displays it. */
export interface ScreenChangePreview {
  willHide: { screen: string; label: string }[];
  willShow: { screen: string; label: string }[];
  currentCount: number;
  nextCount: number;
}

export const listActivities = () => apiClient.get<Activity[]>('/activities').then((r) => r.data);
export const createActivity = (dto: ActivityInput) => apiClient.post<Activity>('/activities', dto).then((r) => r.data);
export const updateActivity = (id: string, dto: ActivityUpdateInput) => apiClient.patch<Activity>(`/activities/${id}`, dto).then((r) => r.data);
export const deleteActivity = (id: string) => apiClient.delete(`/activities/${id}`).then(() => undefined);

export const previewPrimaryActivity = (activityId: string | null) =>
  apiClient
    .get<ScreenChangePreview>('/activities/primary/preview', { params: activityId ? { activityId } : {} })
    .then((r) => r.data);

/** `confirmed` is required; the server rejects the change without it. */
export const setPrimaryActivity = (activityId: string | null) =>
  apiClient.patch<ScreenChangePreview>('/activities/primary', { activityId, confirmed: true }).then((r) => r.data);
