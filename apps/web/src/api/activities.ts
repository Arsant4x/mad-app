import { apiClient } from './client';

export interface Activity {
  id: string;
  name: string;
  activityType: string | null;
  /** How many branches/products point at this activity — the screen uses these
   * to explain the delete guard before the button is pressed. */
  branchCount: number;
  productCount: number;
}

export interface ActivityInput {
  name: string;
  activityType?: string;
}

export const listActivities = () => apiClient.get<Activity[]>('/activities').then((r) => r.data);
export const createActivity = (dto: ActivityInput) => apiClient.post<Activity>('/activities', dto).then((r) => r.data);
export const updateActivity = (id: string, dto: Partial<ActivityInput>) => apiClient.patch<Activity>(`/activities/${id}`, dto).then((r) => r.data);
export const deleteActivity = (id: string) => apiClient.delete(`/activities/${id}`).then(() => undefined);
