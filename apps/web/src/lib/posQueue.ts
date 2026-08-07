import type { Product } from '../api/products';
import type { PosPaymentMethod, PosSaleLine } from '../api/pos';

/**
 * طابور مبيعات الأوفلاين (مستند §6 v2) — localStorage per company.
 *
 * Each queued sale carries a terminal-generated `clientSaleId`: the server
 * dedupes on it, so flushing is safe to retry forever — a sale can be sent
 * twice but never invoiced twice. `offlineRef` is the temporary receipt
 * reference; the REAL invoice number is assigned centrally at sync time,
 * which is what makes several offline terminals collision-free.
 */
export interface QueuedSale {
  clientSaleId: string;
  offlineRef: string;
  ringAt: string;
  lines: PosSaleLine[];
  paymentMethod: PosPaymentMethod;
  /** ما يلزم لعرض الإيصال أوفلاين — الأسماء والأسعار وقت البيع. */
  display: { name: string; quantity: number; unitPrice: number }[];
  total: number;
}

const queueKey = (companyId: string) => `pos.queue.${companyId}`;
const productsKey = (companyId: string) => `pos.products.${companyId}`;

export function readQueue(companyId: string): QueuedSale[] {
  try {
    return JSON.parse(localStorage.getItem(queueKey(companyId)) ?? '[]') as QueuedSale[];
  } catch {
    return [];
  }
}

export function enqueueSale(companyId: string, sale: QueuedSale): void {
  localStorage.setItem(queueKey(companyId), JSON.stringify([...readQueue(companyId), sale]));
}

export function removeFromQueue(companyId: string, clientSaleId: string): void {
  localStorage.setItem(queueKey(companyId), JSON.stringify(readQueue(companyId).filter((s) => s.clientSaleId !== clientSaleId)));
}

/** كتالوج الأصناف آخر مرة وصلنا فيها للخادم — به يبيع الكاشير أثناء الانقطاع. */
export function cacheProducts(companyId: string, products: Product[]): void {
  localStorage.setItem(productsKey(companyId), JSON.stringify(products));
}

export function readCachedProducts(companyId: string): Product[] {
  try {
    return JSON.parse(localStorage.getItem(productsKey(companyId)) ?? '[]') as Product[];
  } catch {
    return [];
  }
}

export function newClientSaleId(): string {
  return crypto.randomUUID();
}

/** مرجع إيصال مؤقت مقروء: OFF-<زمن بأساس 36>. */
export function newOfflineRef(): string {
  return `OFF-${Date.now().toString(36).toUpperCase()}`;
}

/** خطأ شبكة (لا ردّ إطلاقاً) = اشتغل أوفلاين؛ ردّ 4xx/5xx = خطأ حقيقي يُعرض. */
export function isNetworkError(e: unknown): boolean {
  return !!e && typeof e === 'object' && 'request' in e && !(e as { response?: unknown }).response;
}
