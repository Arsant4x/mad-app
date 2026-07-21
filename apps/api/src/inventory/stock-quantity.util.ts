import { Prisma } from '@prisma/client';

export function stockQuantityKey(productId: string, warehouseId: string): string {
  return `${productId}|${warehouseId}`;
}

/** Computes live on-hand quantity per (productId, warehouseId) pair from the
 * full stock movement ledger — there is no materialized balance table (see
 * the schema comment on `StockMovement`); this is the single source of truth
 * everywhere a "current quantity" is needed, matching the mockup's
 * `getStockQty` exactly. */
export async function computeStockQuantities(tx: Prisma.TransactionClient): Promise<Map<string, number>> {
  const movements = await tx.stockMovement.findMany({
    select: { productId: true, warehouseId: true, toWarehouseId: true, type: true, qty: true },
  });

  const quantities = new Map<string, number>();
  const add = (key: string, delta: number) => quantities.set(key, (quantities.get(key) ?? 0) + delta);

  for (const m of movements) {
    const qty = Number(m.qty);
    if (m.type === 'IN') add(stockQuantityKey(m.productId, m.warehouseId), qty);
    else if (m.type === 'OUT') add(stockQuantityKey(m.productId, m.warehouseId), -qty);
    else if (m.type === 'ADJUSTMENT') add(stockQuantityKey(m.productId, m.warehouseId), qty);
    else if (m.type === 'TRANSFER') {
      add(stockQuantityKey(m.productId, m.warehouseId), -qty);
      if (m.toWarehouseId) add(stockQuantityKey(m.productId, m.toWarehouseId), qty);
    }
  }

  return quantities;
}

/** Point lookup for a single (productId, warehouseId) pair — used by
 * `InventoryService.create` to know the current balance before posting a
 * new OUT/TRANSFER movement. Cheaper than `computeStockQuantities` (which
 * scans every movement for every pair) when only one pair is needed. */
export async function currentStockQty(tx: Prisma.TransactionClient, productId: string, warehouseId: string): Promise<number> {
  const movements = await tx.stockMovement.findMany({
    where: { productId, OR: [{ warehouseId }, { toWarehouseId: warehouseId }] },
    select: { warehouseId: true, toWarehouseId: true, type: true, qty: true },
  });

  let qty = 0;
  for (const m of movements) {
    const amount = Number(m.qty);
    if (m.type === 'IN' && m.warehouseId === warehouseId) qty += amount;
    else if (m.type === 'OUT' && m.warehouseId === warehouseId) qty -= amount;
    else if (m.type === 'ADJUSTMENT' && m.warehouseId === warehouseId) qty += amount;
    else if (m.type === 'TRANSFER') {
      if (m.warehouseId === warehouseId) qty -= amount;
      if (m.toWarehouseId === warehouseId) qty += amount;
    }
  }
  return qty;
}
