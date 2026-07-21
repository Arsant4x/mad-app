import { apiClient } from './client';

export interface Warehouse {
  id: string;
  name: string;
  location: string | null;
  manager: string | null;
  itemCount: number;
  totalQty: number;
}

export interface WarehouseInput {
  name: string;
  location?: string;
  manager?: string;
}

export const listWarehouses = () => apiClient.get<Warehouse[]>('/warehouses').then((r) => r.data);
export const createWarehouse = (dto: WarehouseInput) => apiClient.post<Warehouse>('/warehouses', dto).then((r) => r.data);
export const updateWarehouse = (id: string, dto: Partial<WarehouseInput>) => apiClient.patch<Warehouse>(`/warehouses/${id}`, dto).then((r) => r.data);
export const deleteWarehouse = (id: string) => apiClient.delete(`/warehouses/${id}`);
