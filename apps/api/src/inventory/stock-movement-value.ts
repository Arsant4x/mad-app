import { STOCK_MOVEMENT_TYPES } from './dto/create-stock-movement.dto';

/**
 * A manual movement reduces inventory value when it takes stock out or adjusts it down: it posts the loss at once,
 * so it needs the review action like approving a write-off. Read by type and sign before anything is written, since
 * the cost is only known inside the transaction. A transfer moves value between own warehouses without reducing it.
 */
export function reducesInventoryValue(movement: { type: (typeof STOCK_MOVEMENT_TYPES)[number]; qty: number }): boolean {
  return movement.type === 'OUT' || (movement.type === 'ADJUSTMENT' && movement.qty < 0);
}
