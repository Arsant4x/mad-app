import { round2 } from '../money/rounding';
/**
 * Converting a transaction amount into the company's base currency.
 *
 * The rule (CLAUDE.md 6.7): every amount carries its own currency and the rate
 * **as of the transaction**, and the base figure is computed once and stored.
 * It is never recomputed from today's rate — a historical invoice must not
 * silently reprice when the market moves.
 */

export const DEFAULT_CURRENCY = 'SAR';
export const DEFAULT_EXCHANGE_RATE = 1;

/** Money is stored as Decimal(18,2), so the base figure is rounded to 2 places
 * here rather than left to the driver — an unrounded product of a 6-decimal
 * rate would otherwise be truncated inconsistently. */
export function toBaseAmount(amount: number, exchangeRate: number): number {
  return round2(amount * exchangeRate);
}

export interface CurrencyInput {
  currency?: string;
  exchangeRate?: number;
}

/** Normalizes the optional currency fields a DTO may carry. Omitting them
 * means "base currency at parity", which is what every existing caller wants
 * and what keeps single-currency companies from having to think about this. */
export function resolveCurrency(input: CurrencyInput | undefined): { currency: string; exchangeRate: number } {
  return {
    currency: input?.currency?.trim() || DEFAULT_CURRENCY,
    exchangeRate: input?.exchangeRate ?? DEFAULT_EXCHANGE_RATE,
  };
}
