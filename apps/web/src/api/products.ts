import { apiClient } from './client';

export interface Product {
  archived: boolean;
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  /** نصٌّ حرٌّ قديم — يُعرض تلميحاً عند الإعلان ولا يُخمَّن منه رمز. */
  unit: string | null;
  /** ① وحدةُ القياس الأساس رمزاً من القائمة المغلقة (`lib/units.ts`)؛ `null` = لم تُعلَن بعد. */
  unitCode: string | null;
  /** ٥+٦ «يُتتبَّع بالدفعة والانتهاء؟» — علَمٌ ثنائيّ يُعلَن ولا يُخمَّن؛ `null` = لم يُعلَن بعد (يُعدّ ويُعلَن عند لمس الصنف). */
  expiryTracked: boolean | null;
  price: string;
  cost: string;
  minStock: string;
  barcode: string | null;
}

export interface ProductInput {
  name: string;
  sku?: string;
  category?: string;
  unitCode?: string;
  expiryTracked?: boolean;
  price?: number;
  cost?: number;
  minStock?: number;
  barcode?: string;
}

export const listProducts = (includeArchived = false) => apiClient.get<Product[]>('/products', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const createProduct = (dto: ProductInput) => apiClient.post<Product>('/products', dto).then((r) => r.data);
export const updateProduct = (id: string, dto: Partial<ProductInput>) => apiClient.patch<Product>(`/products/${id}`, dto).then((r) => r.data);
export const deleteProduct = (id: string) => apiClient.delete(`/products/${id}`);

/** أرشفة/إلغاء أرشفة — إخفاء من القوائم اليومية مع البقاء في الحسابات. */
export const setProductArchived = (id: string, archived: boolean) => apiClient.patch<Product>(`/products/${id}/archive`, { archived }).then((r) => r.data);
