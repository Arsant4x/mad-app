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
  /** Batch/lot + expiry — used on receiving (IN) perishables. */
  batchNo?: string;
  expiryDate?: string;
}

export interface ExpiringBatch {
  id: string;
  productName: string;
  sku: string | null;
  warehouseName: string;
  batchNo: string | null;
  qty: number;
  expiryDate: string;
  daysLeft: number;
  expired: boolean;
}

export interface StockLevelRow {
  productId: string;
  warehouseId: string;
  product: Product;
  warehouse: Warehouse;
  qty: number;
  status: StockStatus;
}

export interface StockMovementListResponse {
  items: StockMovement[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListStockMovementsParams {
  page?: number;
  pageSize?: number;
  /** Server-side — matches product name, warehouse name, or reason. */
  search?: string;
}

export const listStockMovements = (params: ListStockMovementsParams = {}) =>
  apiClient.get<StockMovementListResponse>('/inventory/movements', { params }).then((r) => r.data);
export const createStockMovement = (dto: StockMovementInput) => apiClient.post<StockMovement & { resultingQty: number }>('/inventory/movements', dto).then((r) => r.data);
export const deleteStockMovement = (id: string) => apiClient.delete(`/inventory/movements/${id}`);
export const getStockLevels = () => apiClient.get<StockLevelRow[]>('/inventory/stock-levels').then((r) => r.data);
export const getExpiringStock = (withinDays = 90) =>
  apiClient.get<ExpiringBatch[]>('/inventory/expiring', { params: { withinDays } }).then((r) => r.data);
