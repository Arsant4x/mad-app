import { apiClient } from './client';

export type Ownership = 'owned' | 'leased' | 'managed';
export type ActivityType = 'residential' | 'shop' | 'showroom' | 'office' | 'warehouse' | 'mixed';

export interface Property {
  archived: boolean;
  id: string;
  name: string;
  address: string | null;
  floors: number;
  activityType: ActivityType | null;
  activitySubtype: string | null;
  ownership: Ownership;
  leaseValue: string | null;
  leaseCycle: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  opRate: string | null;
  deedNo: string | null;
  lat: number | null;
  lng: number | null;
}

export interface PropertyInput {
  name: string;
  address?: string;
  floors?: number;
  activityType?: ActivityType;
  activitySubtype?: string;
  ownership: Ownership;
  leaseValue?: number;
  leaseCycle?: string;
  leaseStart?: string;
  leaseEnd?: string;
  opRate?: number;
  deedNo?: string;
  lat?: number;
  lng?: number;
}

export const listProperties = (includeArchived = false) => apiClient.get<Property[]>('/properties', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const createProperty = (dto: PropertyInput) => apiClient.post<Property>('/properties', dto).then((r) => r.data);
export const updateProperty = (id: string, dto: Partial<PropertyInput>) => apiClient.patch<Property>(`/properties/${id}`, dto).then((r) => r.data);
export const deleteProperty = (id: string) => apiClient.delete(`/properties/${id}`);

/** أرشفة/إلغاء أرشفة — إخفاء من القوائم اليومية مع البقاء في الحسابات. */
export const setPropertyArchived = (id: string, archived: boolean) => apiClient.patch<Property>(`/properties/${id}/archive`, { archived }).then((r) => r.data);
