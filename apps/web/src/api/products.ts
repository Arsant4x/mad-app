import { apiClient } from './client';

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string | null;
  price: string;
  cost: string;
  minStock: string;
  barcode: string | null;
}

export interface ProductInput {
  name: string;
  sku?: string;
  category?: string;
  unit?: string;
  price?: number;
  cost?: number;
  minStock?: number;
  barcode?: string;
}

export const listProducts = () => apiClient.get<Product[]>('/products').then((r) => r.data);
export const createProduct = (dto: ProductInput) => apiClient.post<Product>('/products', dto).then((r) => r.data);
export const updateProduct = (id: string, dto: Partial<ProductInput>) => apiClient.patch<Product>(`/products/${id}`, dto).then((r) => r.data);
export const deleteProduct = (id: string) => apiClient.delete(`/products/${id}`);
