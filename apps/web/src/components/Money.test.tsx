import { render } from '@testing-library/react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Currency } from '../api/currencies';
import { setLanguage } from '../i18n';
import { StaticCurrencies } from './currency/CurrencyContext';
import { CURRENCY_GLYPHS, GLYPH_FILES } from './currency/currencyGlyphs';
import { Money } from './currency/Money';

// File budget: small renders and one file hash, well under the default.
vi.setConfig({ testTimeout: 5_000 });

const OFFICIAL_SIGN = String.fromCodePoint(0x20c1);
// The central bank's published SVG (sama.gov.sa, Saudi_Riyal_Symbol-2.svg), 923 bytes.
const ISSUER_FILE_SHA256 = 'dc035ad6d18c543a79d7e2f24458ab17b869c030875dc2f1d18f2fa9dda9e404';

const currency = (code: string, symbol: string | null, isBase = false): Currency => ({
  id: code,
  code,
  name: code,
  symbol,
  isBase,
  rate: '1',
});
const company = [currency('SAR', OFFICIAL_SIGN, true), currency('USD', '$'), currency('EGP', null)];

function renderMoney(value: string, code?: string) {
  const { container } = render(
    <StaticCurrencies currencies={company}>
      <div dir={document.documentElement.dir}>
        <Money value={value} currency={code} />
      </div>
    </StaticCurrencies>,
  );
  return container.querySelector('.money') as HTMLElement;
}

describe('the official riyal sign', () => {
  afterEach(() => setLanguage('ar'));

  it('is the central bank file itself, byte for byte, and is drawn from its own paths', () => {
    // Tests run from apps/web.
    const file = readFileSync(join(process.cwd(), 'src/assets/currency/saudi-riyal-sign.svg'), 'utf8').replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(file, 'utf8').digest('hex')).toBe(ISSUER_FILE_SHA256);
    expect(GLYPH_FILES[OFFICIAL_SIGN].replace(/\r\n/g, '\n')).toBe(file);
    const glyph = CURRENCY_GLYPHS[OFFICIAL_SIGN];
    expect(glyph.viewBox).toBe('0 0 1124.14 1256.39');
    expect(glyph.paths).toEqual([...file.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]));
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: the sign sits left of the number with a space, the pair laid out left to right`, () => {
      setLanguage(lang);
      const money = renderMoney('1,250.00');
      expect(money.getAttribute('dir')).toBe('ltr');
      const [first, second, third] = Array.from(money.childNodes);
      expect((first as Element).tagName.toLowerCase()).toBe('svg');
      expect(second.textContent).toBe('\u00A0');
      expect(third.textContent).toBe('1,250.00');
      const sign = money.querySelector('svg')!;
      expect(sign.getAttribute('role')).toBe('img');
      expect(sign.getAttribute('aria-label')).toBe(lang === 'ar' ? 'ريال سعودي' : 'Saudi Riyal');
      expect(sign.querySelectorAll('path')).toHaveLength(CURRENCY_GLYPHS[OFFICIAL_SIGN].paths.length);
    });
  }

  it('a negative amount keeps its minus between the sign and the digits', () => {
    setLanguage('ar');
    const money = renderMoney('-75.00');
    expect(money.textContent).toBe('\u00A0-75.00');
    expect(money.firstElementChild?.tagName.toLowerCase()).toBe('svg');
  });

  it('other currencies show their own symbol, or their code without one', () => {
    setLanguage('en');
    expect(renderMoney('10.00', 'USD').textContent).toBe('$\u00A010.00');
    expect(renderMoney('10.00', 'EGP').textContent).toBe('EGP\u00A010.00');
    expect(renderMoney('10.00', 'USD').querySelector('svg')).toBeNull();
  });
});
