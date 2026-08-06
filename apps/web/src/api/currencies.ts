import { apiClient } from './client';

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  isBase: boolean;
  rate: string;
}

export interface CurrencyInput {
  code: string;
  name: string;
  symbol?: string;
  rate?: number;
}

export interface ExchangeRate {
  id: string;
  fromCode: string;
  toCode: string;
  rate: string;
  date: string;
}

export interface ExchangeRateInput {
  fromCode: string;
  toCode: string;
  rate: number;
  date: string;
}

export const listCurrencies = () => apiClient.get<Currency[]>('/currencies').then((r) => r.data);
export const createCurrency = (dto: CurrencyInput) => apiClient.post<Currency>('/currencies', dto).then((r) => r.data);
export const updateCurrency = (id: string, dto: Partial<Omit<CurrencyInput, 'code'>>) =>
  apiClient.patch<Currency>(`/currencies/${id}`, dto).then((r) => r.data);
export const deleteCurrency = (id: string) => apiClient.delete(`/currencies/${id}`).then(() => undefined);

export const listExchangeRates = (params: { fromCode?: string; toCode?: string } = {}) =>
  apiClient.get<ExchangeRate[]>('/currencies/rates', { params }).then((r) => r.data);

/** Re-recording an existing day overwrites it — a day has one official rate. */
export const upsertExchangeRate = (dto: ExchangeRateInput) => apiClient.post<ExchangeRate>('/currencies/rates', dto).then((r) => r.data);
