import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from './index';
import { formatDate, formatDateTime, formatNumber, formatTime } from './format';

// File budget: pure formatting calls, well under the default.
vi.setConfig({ testTimeout: 5_000 });

// Arabic-Indic (U+0660..U+0669) and extended Arabic-Indic (U+06F0..U+06F9) digits.
const NON_LATIN_DIGIT = /[٠-٩۰-۹]/;
const when = '2026-10-12T15:30:00Z';

describe('dates and numbers use Latin digits in both languages', () => {
  afterEach(() => setLanguage('ar'));

  it('Arabic: numbers, dates and times carry Latin digits only', () => {
    setLanguage('ar');
    const samples = [
      formatNumber(1234567.5),
      formatNumber(12.5, { minimumFractionDigits: 2 }),
      formatDate(when),
      formatDate(when, undefined, 'ar-SA-u-ca-gregory'),
      formatTime(when, { hour: '2-digit', minute: '2-digit' }),
      formatDateTime(when),
    ];
    for (const text of samples) {
      expect(text).not.toMatch(NON_LATIN_DIGIT);
      expect(text).toMatch(/[0-9]/);
    }
  });

  it('Arabic keeps its own month names and separators', () => {
    setLanguage('ar');
    expect(formatDate(when, { month: 'long' }, 'ar-SA-u-ca-gregory')).toBe('أكتوبر');
    expect(formatNumber(1234567.5)).toBe('1,234,567.5');
  });

  it('English is unchanged', () => {
    setLanguage('en');
    expect(formatDate(when, { day: 'numeric', month: 'long', year: 'numeric' })).toBe('12 October 2026');
    expect(formatNumber(1234567.5)).toBe('1,234,567.5');
  });
});
