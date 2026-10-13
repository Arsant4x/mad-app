import riyalSignFile from '../../assets/currency/saudi-riyal-sign.svg?raw';

/**
 * Currency signs that fonts may not carry yet, drawn from the issuer's own
 * file and never redrawn: the shape is read from the file as published.
 * Keyed by the sign's Unicode character, which is what a currency row stores
 * as its symbol, so screens never name a currency to pick its sign.
 */
export interface CurrencyGlyph {
  viewBox: string;
  paths: string[];
}

export function glyphFromSvg(svg: string): CurrencyGlyph {
  const viewBox = /<svg\b[^>]*\sviewBox="([^"]+)"/.exec(svg)?.[1];
  const paths = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  if (!viewBox || paths.length === 0) throw new Error('Currency sign file has no shape to draw');
  return { viewBox, paths };
}

/** The issuer's file for each sign, as published (the test pins its hash). */
export const GLYPH_FILES: Readonly<Record<string, string>> = {
  '\u20C1': riyalSignFile,
};

export const CURRENCY_GLYPHS: Readonly<Record<string, CurrencyGlyph>> = Object.fromEntries(
  Object.entries(GLYPH_FILES).map(([sign, file]) => [sign, glyphFromSvg(file)]),
);
