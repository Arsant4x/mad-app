import { apiClient } from './client';
import { SECTOR_VALUES } from '@mad-app/shared/api/enums';
import type { Sector } from '@mad-app/shared/api/enums';
import type { CreateActivityDto } from '@mad-app/shared/api/requests';

/** القطاعات — **مولَّدةٌ من `apps/api/src/activities/sectors.ts`** عبر سجلّ التعدادات (`ق-١٣٨٤`)، بترتيب المصدر. */
export const SECTORS = SECTOR_VALUES;
export type { Sector };

export const SECTOR_LABELS: Record<Sector, string> = {
  REALESTATE: 'مكتب عقاري',
  RESTAURANT: 'مطعم أو كافيه',
  RETAIL: 'تجزئة',
  PHARMACY: 'صيدلية',
  CONTRACTING: 'مقاولات',
  FREELANCE: 'عمل حرّ',
  OTHER: 'أخرى',
};

export interface Activity {
  id: string;
  name: string;
  activityType: string | null;
  /** القطاع **المؤكَّد** من المالك — وعليه وحده يقع الترشيح. */
  sector: Sector | null;
  /**
   * ما رشّحته المطابقة الآلية — **اقتراحٌ لا حكم**.
   *
   * ⚠️ ولا يُستعمل في أي حساب: يُعرض للمالك ليؤكّد أو يغيّر. واستعمالُه
   * كأنه `sector` يمحو الفرق بين «رشّحه الحاسوب» و«أكّده الإنسان».
   */
  sectorSuggested: Sector | null;
  /** التعطيل لا الحذف: الشاشات تختفي والبيانات تبقى. */
  disabledAt: string | null;
  /** How many branches/products point at this activity — the screen uses these
   * to explain the delete guard before the button is pressed. */
  branchCount: number;
  productCount: number;
}

export type ActivityInput = CreateActivityDto;

/** التعطيلُ تعديلٌ لا إنشاء — `CreateActivityDto` لا يعرف `disabled` فيردّه `400` (`ق-١٣٨٤`). */
export interface ActivityUpdateInput extends Partial<ActivityInput> {
  disabled?: boolean;
}

/** ما سيختفي وما سيظهر — **محسوبٌ في الخادم**، والواجهة تعرضه. */
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

/** ⚠️ `confirmed` إلزاميّ — والخادم يرفض بدونه. */
export const setPrimaryActivity = (activityId: string | null) =>
  apiClient.patch<ScreenChangePreview>('/activities/primary', { activityId, confirmed: true }).then((r) => r.data);
