import { apiClient } from './client';
import type { Product } from './products';
import type { Warehouse } from './warehouses';
import type { StockMovementType, StockStatus } from '@mad-app/shared/api/enums';
import type { CreateStockMovementDto, InventoryListMovementsQuery } from '@mad-app/shared/api/requests';

export type { StockMovementType };
export type { StockStatus };

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

export type StockMovementInput = CreateStockMovementDto;

export interface ExpiringBatch {
  id: string;
  /** ٥+٦ `BATCH`: دفعةٌ كيانٌ بما بقي في طبقاتها · `LEGACY_MOVEMENT`: حركةُ إدخالٍ قديمة بدفعةٍ نصّاً — تبقى وتُعدّ ولا تُخمَّن. */
  source: 'BATCH' | 'LEGACY_MOVEMENT';
  productId: string;
  productName: string;
  sku: string | null;
  warehouseName: string;
  batchNo: string | null;
  qty: number;
  /** `REMAINING` المتبقّي من الطبقات · `RECEIVED` الواردُ على حركةٍ قديمة (لا يُعرف متبقّيها). */
  qtyKind: 'REMAINING' | 'RECEIVED';
  expiryDate: string;
  daysLeft: number;
  expired: boolean;
}

export interface ExpiringStockResponse {
  rows: ExpiringBatch[];
  /** الحدودُ الثلاثة المعلَنة في وجه ما بُني (ق-١٠٨٥) — يردّها الخادم مع الصفوف. */
  declaredLimits: string[];
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

export type ListStockMovementsParams = InventoryListMovementsQuery;

export const listStockMovements = (params: ListStockMovementsParams = {}) =>
  apiClient.get<StockMovementListResponse>('/inventory/movements', { params }).then((r) => r.data);
export const createStockMovement = (dto: StockMovementInput) => apiClient.post<StockMovement & { resultingQty: number }>('/inventory/movements', dto).then((r) => r.data);
/** ㉙ عكسُ الحركة بحركةٍ مقابلة — لا حذف (ق-١٠٦٣): تاريخُ المخزون لا يُمحى. */
export const reverseStockMovement = (id: string) => apiClient.post<StockMovement & { resultingQty: number }>(`/inventory/movements/${id}/reverse`, {}).then((r) => r.data);
export const getStockLevels = () => apiClient.get<StockLevelRow[]>('/inventory/stock-levels').then((r) => r.data);
export const getExpiringStock = (withinDays = 90) =>
  apiClient.get<ExpiringStockResponse>('/inventory/expiring', { params: { withinDays } }).then((r) => r.data);
