import { currentLanguage } from './index';

/**
 * Dates and numbers in the user's language.
 *
 * Arabic keeps the exact locale each screen used before the bilingual change
 * (for example 'ar-SA' or 'ar-SA-u-ca-gregory'), so the Arabic interface looks
 * the same. English uses 'en-GB' (day, month, year; Gregorian).
 */
export function uiLocale(arabicLocale = 'ar-SA'): string {
  return currentLanguage() === 'en' ? 'en-GB' : arabicLocale;
}

type DateInput = string | number | Date;

export const formatDate = (value: DateInput, options?: Intl.DateTimeFormatOptions, arabicLocale?: string) =>
  new Date(value).toLocaleDateString(uiLocale(arabicLocale), options);

export const formatTime = (value: DateInput, options?: Intl.DateTimeFormatOptions, arabicLocale?: string) =>
  new Date(value).toLocaleTimeString(uiLocale(arabicLocale), options);

export const formatDateTime = (value: DateInput, options?: Intl.DateTimeFormatOptions, arabicLocale?: string) =>
  new Date(value).toLocaleString(uiLocale(arabicLocale), options);

export const formatNumber = (value: number, options?: Intl.NumberFormatOptions, arabicLocale?: string) =>
  value.toLocaleString(uiLocale(arabicLocale), options);
