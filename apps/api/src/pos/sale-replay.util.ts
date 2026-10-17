import { round2, roundTo } from '../common/money/rounding';
import type { CreatePosSaleDto } from './dto/pos.dto';

type Amount = { toString(): string } | number | string;

/** What a recorded POS sale holds of the request that rang it: the buyer, how it was paid, and its lines in order. */
export interface RecordedSale {
  customerId: string;
  customer: { name: string } | null;
  paymentMethod: string | null;
  lines: readonly { productId: string | null; quantity: Amount; discount: Amount }[];
  posPayments: readonly { method: string; amount: Amount }[];
}

const qty = (value: Amount) => roundTo(Number(value), 'DERIVED_QUANTITY');
const amount = (value: Amount) => round2(Number(value));

/**
 * Whether a request for a known sale id asks for the sale that id recorded. Compared on what the cashier sends: the buyer
 * (the walk-in customer when none is named), the payment method and its split, and each line's product, quantity and
 * discount. The ring time and the device reference are not compared, since a resend carries them as they were.
 */
export function isSameSale(recorded: RecordedSale, request: CreatePosSaleDto, walkInCustomerName: string): boolean {
  const buyer = request.customerId ? recorded.customerId === request.customerId : recorded.customer?.name === walkInCustomerName;
  if (!buyer || recorded.paymentMethod !== request.paymentMethod) return false;
  if (recorded.lines.length !== request.lines.length) return false;
  const linesMatch = request.lines.every((line, i) => {
    const kept = recorded.lines[i];
    return kept.productId === line.productId && qty(kept.quantity) === qty(line.quantity) && amount(kept.discount) === amount(line.discount ?? 0);
  });
  if (!linesMatch) return false;
  if (request.paymentMethod !== 'SPLIT') return true;
  const parts = (rows: readonly { method: string; amount: Amount }[]) => rows.map((p) => `${p.method}:${amount(p.amount)}`).sort();
  const asked = parts(request.payments ?? []);
  const paid = parts(recorded.posPayments);
  return asked.length === paid.length && asked.every((p, i) => p === paid[i]);
}
