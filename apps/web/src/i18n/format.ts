import { currentLanguage } from './index';

/**
 * Dates and numbers in the user's language, always with Latin digits (123).
 *
 * Arabic keeps the locale each screen used before the bilingual change
 * (for example 'ar-SA' or 'ar-SA-u-ca-gregory') for month names, order and
 * separators, with the numbering system forced to Latin. English uses 'en-GB'
 * (day, month, year; Gregorian).
 */
export function uiLocale(arabicLocale = 'ar-SA'): string {
  if (currentLanguage() === 'en') return 'en-GB';
  return new Intl.Locale(arabicLocale, { numberingSystem: 'latn' }).toString();
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
