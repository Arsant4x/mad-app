import { apiClient } from './client';
import type { Product } from './products';
import type { Warehouse } from './warehouses';

export type StockMovementType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';
export type StockStatus = 'out' | 'low' | 'available';

export interface StockMovement {
  id: string;
  productId: string;
  product: Product;
  warehouseId: string;
  warehouse: Warehouse;
  toWarehouseId: string | null;
  toWarehouse: Warehouse | null;
  type: StockMovementType;
  qty: string;
  reason: string | null;
  date: string;
}

export interface StockMovementInput {
  productId: string;
  warehouseId: string;
  toWarehouseId?: string;
  type: StockMovementType;
  qty: number;
  date: string;
  reason?: string;
}

export interface StockLevelRow {
  productId: string;
  warehouseId: string;
  product: Product;
  warehouse: Warehouse;
  qty: number;
  status: StockStatus;
}

export const listStockMovements = () => apiClient.get<StockMovement[]>('/inventory/movements').then((r) => r.data);
export const createStockMovement = (dto: StockMovementInput) => apiClient.post<StockMovement & { resultingQty: number }>('/inventory/movements', dto).then((r) => r.data);
export const deleteStockMovement = (id: string) => apiClient.delete(`/inventory/movements/${id}`);
export const getStockLevels = () => apiClient.get<StockLevelRow[]>('/inventory/stock-levels').then((r) => r.data);
