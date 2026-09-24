import { Prisma } from '@prisma/client';
import { round2 } from '../money/rounding';
/**
 * Converting a transaction amount into the company's base currency.
 *
 * The rule (CLAUDE.md 6.7): every amount carries its own currency and the rate
 * **as of the transaction**, and the base figure is computed once and stored.
 * It is never recomputed from today's rate — a historical invoice must not
 * silently reprice when the market moves.
 *
 * 🔴 `ق-١٣٦٨` — **مستندٌ بلا عملةٍ صريحة يسقط إلى عملة أساس المنشأة لا إلى الريال**: كان هنا `DEFAULT_CURRENCY = 'SAR'`
 * فمستندٌ بلا عملةٍ يُخزَّن ريالاً بسعر ١ أيّاً كانت عملةُ المنشأة (المسح `25` ج — تسعةُ نداءات). والعملةُ الآن من
 * `Company.baseCurrency` (عمودٌ بلا افتراضٍ في القاعدة، يُكتب من سجلّ الأقاليم عند الميلاد).
 */

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
 * and what keeps single-currency companies from having to think about this.
 * ⚠️ `baseCurrency` إلزاميّ — **عملةُ المنشأة لا ثابتٌ** (`ق-١٣٦٨`)؛ ومن ليس في يده يقرؤه بـ`resolveCurrencyWithin`. */
export function resolveCurrency(input: CurrencyInput | undefined, baseCurrency: string): { currency: string; exchangeRate: number } {
  return {
    currency: input?.currency?.trim() || baseCurrency,
    exchangeRate: input?.exchangeRate ?? DEFAULT_EXCHANGE_RATE,
  };
}

/** عملةُ أساس المنشأة — تُقرأ داخل معاملة المستأجر (`companies` بلا عزل صفوف، والقراءةُ بالمعرّف). */
export async function companyBaseCurrency(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const company = await tx.company.findUnique({ where: { id: companyId }, select: { baseCurrency: true } });
  if (!company) throw new Error(`company ${companyId} not found while resolving its base currency`);
  return company.baseCurrency;
}

/**
 * `resolveCurrency` داخل المعاملة: **عملةُ المنشأة تُقرأ حين لا تُعلَن عملةٌ صريحة وحدَه** — فمستندٌ بعملته لا يدفع قراءةً زائدة.
 */
export async function resolveCurrencyWithin(
  tx: Prisma.TransactionClient,
  companyId: string,
  input: CurrencyInput | undefined,
): Promise<{ currency: string; exchangeRate: number }> {
  const explicit = input?.currency?.trim();
  return resolveCurrency(input, explicit || (await companyBaseCurrency(tx, companyId)));
}
