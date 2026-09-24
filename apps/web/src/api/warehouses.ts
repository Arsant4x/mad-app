import { apiClient } from './client';
import type { CreateWarehouseDto } from '@mad-app/shared/api/requests';

export interface Warehouse {
  archived: boolean;
  id: string;
  name: string;
  location: string | null;
  manager: string | null;
  itemCount: number;
  totalQty: number;
}

export type WarehouseInput = CreateWarehouseDto;

export const listWarehouses = (includeArchived = false) =>
  apiClient.get<Warehouse[]>('/warehouses', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const createWarehouse = (dto: WarehouseInput) => apiClient.post<Warehouse>('/warehouses', dto).then((r) => r.data);
export const updateWarehouse = (id: string, dto: Partial<WarehouseInput>) => apiClient.patch<Warehouse>(`/warehouses/${id}`, dto).then((r) => r.data);
export const deleteWarehouse = (id: string) => apiClient.delete(`/warehouses/${id}`);

/** أرشفة/إلغاء أرشفة — إخفاء من القوائم اليومية مع البقاء في الحسابات. */
export const setWarehouseArchived = (id: string, archived: boolean) => apiClient.patch<Warehouse>(`/warehouses/${id}/archive`, { archived }).then((r) => r.data);
