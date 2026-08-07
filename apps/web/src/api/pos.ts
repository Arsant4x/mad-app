import { apiClient } from './client';
import type { Invoice } from './invoices';

export type PosPaymentMethod = 'CASH' | 'CARD' | 'SPLIT';

export interface PosPaymentPart {
  method: 'CASH' | 'CARD';
  amount: number;
}

export interface PosShift {
  id: string;
  branchId: string | null;
  openedById: string;
  openedByName: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  declaredClosing: string | null;
  notes: string | null;
  /** live drawer math — derived server-side from the shift's invoices. */
  salesCount: number;
  cashTotal: number;
  cardTotal: number;
  expectedCash: number;
}

export interface ClosedShift extends PosShift {
  /** موجب = زيادة، سالب = عجز. */
  variance: number;
}

export interface PosSaleLine {
  productId: string;
  quantity: number;
}

export const getCurrentShift = () => apiClient.get<PosShift | null>('/pos/shifts/current').then((r) => r.data);
export const listShifts = () => apiClient.get<PosShift[]>('/pos/shifts').then((r) => r.data);
export const openShift = (openingFloat: number, branchId?: string) =>
  apiClient.post<PosShift>('/pos/shifts', { openingFloat, branchId }).then((r) => r.data);
export const closeShift = (id: string, declaredClosing: number, notes?: string) =>
  apiClient.post<ClosedShift>(`/pos/shifts/${id}/close`, { declaredClosing, notes }).then((r) => r.data);
export const createPosSale = (lines: PosSaleLine[], paymentMethod: PosPaymentMethod, customerId?: string) =>
  apiClient.post<Invoice>('/pos/sales', { lines, paymentMethod, customerId }).then((r) => r.data);

/** مزامنة بيع أوفلاين — idempotent على clientSaleId: التكرار يعيد نفس الفاتورة. */
export const syncPosSale = (sale: { clientSaleId: string; offlineRef?: string; ringAt?: string; lines: PosSaleLine[]; paymentMethod: PosPaymentMethod; payments?: PosPaymentPart[]; customerId?: string }) =>
  apiClient.post<Invoice>('/pos/sales/sync', sale).then((r) => r.data);
