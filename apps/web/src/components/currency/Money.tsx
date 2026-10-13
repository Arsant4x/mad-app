import { useTranslation } from 'react-i18next';
import { currentLanguage } from '../../i18n';
import { CURRENCY_GLYPHS } from './currencyGlyphs';
import { useCurrency } from './CurrencyContext';

/** Name of a currency in the interface language, for screen readers. */
function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames([currentLanguage()], { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * A currency's sign: the issuer's drawn sign when fonts may lack it, otherwise
 * the symbol from the company's currency settings, otherwise the code.
 */
export function CurrencySign({ symbol, code }: { symbol?: string | null; code: string }) {
  useTranslation();
  const glyph = symbol ? CURRENCY_GLYPHS[symbol] : undefined;
  if (glyph) {
    return (
      <svg className="currency-sign" viewBox={glyph.viewBox} role="img" aria-label={currencyName(code)} focusable="false">
        {glyph.paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  }
  return <span className="currency-code">{symbol || code}</span>;
}

/** The sign of a company currency (the base currency when no code is given). */
export function CurrencyMark({ code }: { code?: string | null }) {
  const currency = useCurrency(code);
  const shown = currency?.code ?? code;
  return shown ? <CurrencySign symbol={currency?.symbol} code={shown} /> : null;
}

/**
 * An amount with its currency sign on the left of the number in both
 * languages and a space between them. The pair is laid out left to right on
 * its own, so the sign stays on the left whatever the surrounding direction
 * (amount cells are already left to right), and a minus sign stays between the
 * sign and the digits. `value` is the amount as already formatted.
 */
export function Money({ value, currency }: { value: string; currency?: string | null }) {
  useTranslation();
  const found = useCurrency(currency);
  const code = found?.code ?? currency;
  return (
    <span className="money" dir="ltr">
      {code ? (
        <>
          <CurrencySign symbol={found?.symbol} code={code} />
          {'\u00A0'}
        </>
      ) : null}
      <span className="money-value">{value}</span>
    </span>
  );
}
