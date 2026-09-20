// كسرٌ مقصود للقاعدة ④ (جهةُ api/): دالّةُ قائمةٍ تعود مصفوفةً كاملة — وليست في قائمة الاستثناء.
import { apiClient } from '../../../api/client';

export interface Thing {
  id: string;
}

export const listFixtureThings = () => apiClient.get<Thing[]>('/fixture-things').then((r) => r.data);
