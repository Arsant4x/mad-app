import { apiClient } from './client';
import type { UnitStatus } from '@mad-app/shared/api/enums';

export type { UnitStatus };

export interface Unit {
  archived: boolean;
  id: string;
  propertyId: string;
  unitNo: string;
  floor: string | null;
  type: string;
  subtype: string | null;
  rentMonthly: string;
  underMaintenance: boolean;
  status: UnitStatus;
  currentTenant: string | null;
  reservedBy: string | null;
  /** اسم مستأجر العقد القادم المؤكَّد — يملأ حالة upcoming فقط. */
  upcomingTenant: string | null;
  roomDetails: string | null;
}

export interface UnitInput {
  roomDetails?: string;
  propertyId: string;
  unitNo: string;
  floor?: string;
  type: string;
  subtype?: string;
  rentMonthly: number;
  underMaintenance?: boolean;
}

export const listUnits = (includeArchived = false) => apiClient.get<Unit[]>('/units', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const createUnit = (dto: UnitInput) => apiClient.post<Unit>('/units', dto).then((r) => r.data);
export const updateUnit = (id: string, dto: Partial<Omit<UnitInput, 'propertyId' | 'unitNo'>>) => apiClient.patch<Unit>(`/units/${id}`, dto).then((r) => r.data);
export const deleteUnit = (id: string) => apiClient.delete(`/units/${id}`);

/** أرشفة/إلغاء أرشفة — إخفاء من القوائم اليومية مع البقاء في الحسابات. */
export const setUnitArchived = (id: string, archived: boolean) => apiClient.patch<Unit>(`/units/${id}/archive`, { archived }).then((r) => r.data);

/** إنشاء بالجملة: بادئة + عدد — كلٌّ أو لا شيء، والتصادم يسمّي أرقامه. */
export const bulkCreateUnits = (dto: { propertyId: string; prefix: string; count: number; startAt?: number; floor?: string; type: string; subtype?: string; rentMonthly: number }) =>
  apiClient.post<{ created: number; unitNos: string[] }>('/units/bulk', dto).then((r) => r.data);
