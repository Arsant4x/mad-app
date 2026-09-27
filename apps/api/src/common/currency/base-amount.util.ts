import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatMessage, MSG } from '../i18n/messages';
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
 *
 * 🔴 `ق-١٤٨٩` (فائتُ القياس M1) — **ولا سعرَ ١ لعملةٍ أجنبية**: كان `exchangeRate ?? 1` يُسعّر مستنداً بعملةٍ غيرِ عملة
 * المنشأة بسعر ١ بصمت إن لم يُرسَل سعرُه — ففاتورةٌ بمئة دولار أساسُها مئة، ثم سندٌ بسعره الحقيقيّ يُخصَّص عليها فيصنع
 * «فرقَ صرفٍ» على `5600` ليس فرقاً. **والسعرُ ١ صحيحٌ لعملة الأساس وحدَها** — فعملةٌ أجنبيةٌ بلا سعرٍ تُرفض مسمّاةً
 * (`currency_rate_required`) قبل أيّ كتابة، ولا يُخترع لها سعر.
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

/**
 * أهي عملةُ أساس المنشأة؟ — **بلا اعتبارٍ لحالة الأحرف**: الرمزُ ثلاثيٌّ لا يُطبَّع في الـDTO، و`sar` و`SAR` رمزٌ واحد؛
 * فمقارنةٌ حرفيةٌ كانت سترفض مستنداً بعملة المنشأة نفسِها لأنه كُتب بأحرفٍ صغيرة.
 */
export function isBaseCurrency(currency: string, baseCurrency: string): boolean {
  return currency.trim().toUpperCase() === baseCurrency.trim().toUpperCase();
}

/** Normalizes the optional currency fields a DTO may carry. Omitting them
 * means "base currency at parity", which is what every existing caller wants
 * and what keeps single-currency companies from having to think about this.
 * ⚠️ `baseCurrency` إلزاميّ — **عملةُ المنشأة لا ثابتٌ** (`ق-١٣٦٨`)؛ ومن ليس في يده يقرؤه بـ`resolveCurrencyWithin`.
 *
 * ⚖️ `ق-١٤٨٩`: **السعرُ الغائب يُقرأ «١» لعملة الأساس وحدَها** — وعملةٌ أجنبيةٌ بلا سعرٍ تُرمى `400` مسمّاةً. و`null` كالغياب:
 * `@IsOptional` يُمرّره، و`?? 1` القديم كان يعامله غياباً — فلا يُفتح الثقبُ من بابه الثاني. */
export function resolveCurrency(input: CurrencyInput | undefined, baseCurrency: string): { currency: string; exchangeRate: number } {
  const currency = input?.currency?.trim() || baseCurrency;
  const rate = input?.exchangeRate ?? null;
  if (rate !== null) return { currency, exchangeRate: rate };
  if (!isBaseCurrency(currency, baseCurrency)) {
    throw new BadRequestException(formatMessage(MSG.currency_rate_required, { currency, base: baseCurrency }));
  }
  return { currency, exchangeRate: DEFAULT_EXCHANGE_RATE };
}

/** عملةُ أساس المنشأة — تُقرأ داخل معاملة المستأجر (`companies` بلا عزل صفوف، والقراءةُ بالمعرّف). */
export async function companyBaseCurrency(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const company = await tx.company.findUnique({ where: { id: companyId }, select: { baseCurrency: true } });
  if (!company) throw new Error(`company ${companyId} not found while resolving its base currency`);
  return company.baseCurrency;
}

/**
 * `resolveCurrency` داخل المعاملة: **عملةٌ صريحةٌ بسعرها لا تدفع قراءةً زائدة** — فلا حاجةَ فيها إلى عملة المنشأة.
 *
 * وما عداها يُقاس بعملة المنشأة (`ق-١٤٨٩`): **بلا عملةٍ** ⟵ هي بسعر ١؛ **وبعملةٍ بلا سعر** ⟵ يُسأل: أهي عملةُ الأساس
 * (فسعرُها ١) أم أجنبية (فتُرفض مسمّاةً)؟ — وكان هذا الفرعُ يمرّر العملةَ الصريحةَ نفسَها «عملةَ أساس» فلا يُسأل أبداً.
 */
export async function resolveCurrencyWithin(
  tx: Prisma.TransactionClient,
  companyId: string,
  input: CurrencyInput | undefined,
): Promise<{ currency: string; exchangeRate: number }> {
  const explicit = input?.currency?.trim();
  const rate = input?.exchangeRate ?? null;
  if (explicit && rate !== null) return { currency: explicit, exchangeRate: rate };
  return resolveCurrency(input, await companyBaseCurrency(tx, companyId));
}
