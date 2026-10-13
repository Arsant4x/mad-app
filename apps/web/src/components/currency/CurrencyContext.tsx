import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { listCurrencies, type Currency } from '../../api/currencies';

interface CurrencyState {
  /** The company's currencies, or null until they have loaded. */
  currencies: Currency[] | null;
  /** Read them again after a currency is added, edited or removed. */
  reload: () => void;
}

const CurrencyContext = createContext<CurrencyState>({ currencies: null, reload: () => {} });

/** Loads the company's currencies once for the signed-in shell. */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currencies, setCurrencies] = useState<Currency[] | null>(null);
  const reload = useCallback(() => {
    listCurrencies().then(setCurrencies, () => setCurrencies([]));
  }, []);
  useEffect(reload, [reload]);
  return <CurrencyContext.Provider value={{ currencies, reload }}>{children}</CurrencyContext.Provider>;
}

/** Test and preview seam: give the currencies directly. */
export function StaticCurrencies({ currencies, children }: { currencies: Currency[]; children: ReactNode }) {
  return <CurrencyContext.Provider value={{ currencies, reload: () => {} }}>{children}</CurrencyContext.Provider>;
}

export const useCurrencies = () => useContext(CurrencyContext);

/** The company currency with this code, or the base currency when no code is given. */
export function useCurrency(code?: string | null): Currency | undefined {
  const { currencies } = useCurrencies();
  if (!currencies) return undefined;
  return code ? currencies.find((c) => c.code === code) : currencies.find((c) => c.isBase);
}
