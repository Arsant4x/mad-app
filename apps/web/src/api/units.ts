import { apiClient } from './client';

export type UnitStatus = 'vacant' | 'rented' | 'maintenance' | 'reserved';

export interface Unit {
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
}

export interface UnitInput {
  propertyId: string;
  unitNo: string;
  floor?: string;
  type: string;
  subtype?: string;
  rentMonthly: number;
  underMaintenance?: boolean;
}

export const listUnits = () => apiClient.get<Unit[]>('/units').then((r) => r.data);
export const createUnit = (dto: UnitInput) => apiClient.post<Unit>('/units', dto).then((r) => r.data);
export const updateUnit = (id: string, dto: Partial<Omit<UnitInput, 'propertyId' | 'unitNo'>>) => apiClient.patch<Unit>(`/units/${id}`, dto).then((r) => r.data);
export const deleteUnit = (id: string) => apiClient.delete(`/units/${id}`);
