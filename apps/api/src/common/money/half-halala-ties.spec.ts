import { roundPercentOf, roundProduct } from './rounding';
import { computeDocumentTotals, computeNetTotals, lineGross, lineNet, lineTax } from './totals';

// Suite budget: the slowest case runs in about two seconds here; three times that, above the five second default under load.
jest.setTimeout(15000);

/**
 * Exact half halala ties in document totals. The project rule rounds half away from zero on the decimal
 * value (rounding.ts), so a product that is exactly x.xx5 must round up in magnitude. The oracle here
 * works in whole units with no binary fractions, so it is exact.
 */

/** n / d for integers with d > 0, rounded half away from zero. */
const divideHalfAway = (n: number, d: number) => Math.sign(n) * Math.floor((Math.abs(n) + d / 2) / d);

const STANDARD_RATE = 15;

interface Miss {
  input: string;
  expected: number;
  got: number;
}

function summary(misses: Miss[], checked: number) {
  return { checked, misses: misses.length, first: misses.slice(0, 3) };
}

describe('Half halala ties in document totals', () => {
  it('rounds the tax on every taxable amount from 0.01 to 10,000.00 that is an exact half halala tie away from zero', () => {
    const misses: Miss[] = [];
    let checked = 0;
    for (let halalas = 1; halalas <= 1_000_000; halalas++) {
      // tax in halalas is halalas × 15 / 100; a tie when the remainder is exactly half.
      if ((halalas * STANDARD_RATE) % 100 !== 50) continue;
      checked++;
      const expected = divideHalfAway(halalas * STANDARD_RATE, 100) / 100;
      const got = computeNetTotals(halalas / 100, STANDARD_RATE).taxTotal;
      if (got !== expected) misses.push({ input: (halalas / 100).toFixed(2), expected, got });
    }
    expect(summary(misses, checked)).toEqual({ checked: 50_000, misses: 0, first: [] });
  });

  it('gives a credit note the exact negative of the tie tax', () => {
    const misses: Miss[] = [];
    let checked = 0;
    for (let halalas = 10; halalas <= 1_000_000; halalas += 20) {
      checked++;
      const expected = divideHalfAway(-halalas * STANDARD_RATE, 100) / 100;
      const got = computeNetTotals(-halalas / 100, STANDARD_RATE).taxTotal;
      if (got !== expected) misses.push({ input: (-halalas / 100).toFixed(2), expected, got });
    }
    expect(summary(misses, checked)).toEqual({ checked: 50_000, misses: 0, first: [] });
  });

  it('rounds the line tax shown on a line the same way as the rate tax', () => {
    const line = { quantity: 1, unitPrice: 100.3, taxRate: STANDARD_RATE, taxCategory: 'S' };
    expect(lineTax(line)).toBe(15.05);
    const totals = computeDocumentTotals([line]);
    expect([totals.subtotal, totals.byRate[0].tax, totals.taxTotal, totals.total]).toEqual([100.3, 15.05, 15.05, 115.35]);
  });

  it('rounds quantity times price that is an exact half halala tie away from zero', () => {
    const misses: Miss[] = [];
    let checked = 0;
    // Quantities in thousandths (Decimal(18,3)) times prices in halalas: the product is in units of 0.00001.
    const quantities = [5, 125, 375, 500, 875, 1_250, 1_500, 2_500, 3_500, 7_500, 12_500, 33_500];
    for (const mils of quantities) {
      for (let halalas = 1; halalas <= 50_000; halalas++) {
        const units = mils * halalas;
        if (units % 1_000 !== 500) continue;
        checked++;
        const expected = divideHalfAway(units, 1_000) / 100;
        const line = { quantity: mils / 1_000, unitPrice: halalas / 100, taxRate: 0 };
        const got = lineGross(line);
        if (got !== expected || lineNet(line) !== expected) misses.push({ input: `${mils / 1_000} x ${halalas / 100}`, expected, got });
      }
    }
    // Whole quantities times prices in thousandths (a unit price may carry six places).
    for (let quantity = 1; quantity <= 30; quantity++) {
      for (let mils = 1; mils <= 10_000; mils++) {
        const units = quantity * mils;
        if (units % 10 !== 5) continue;
        checked++;
        const expected = divideHalfAway(units, 10) / 100;
        const got = lineGross({ quantity, unitPrice: mils / 1_000, taxRate: 0 });
        if (got !== expected) misses.push({ input: `${quantity} x ${mils / 1_000}`, expected, got });
      }
    }
    expect(checked).toBeGreaterThan(200_000);
    expect({ misses: misses.length, first: misses.slice(0, 3) }).toEqual({ misses: 0, first: [] });
  });

  it('the exact product reads exponent forms, keeps the sign, gives no negative zero and passes non finite values through', () => {
    expect(roundProduct(0.375, 0.6, 'LINE_AMOUNT')).toBe(0.23);
    expect(roundProduct(-0.375, 0.6, 'LINE_AMOUNT')).toBe(-0.23);
    expect(roundProduct(0.375, -0.6, 'LINE_AMOUNT')).toBe(-0.23);
    expect(roundProduct(2.333, 1.234567, 'UNIT_PRICE')).toBe(2.880245);
    expect(roundProduct(1e-7, 3, 'LINE_AMOUNT')).toBe(0);
    expect(Object.is(roundProduct(-1e-7, 3, 'LINE_AMOUNT'), 0)).toBe(true);
    expect(roundProduct(1e21, 2, 'LINE_AMOUNT')).toBe(2e21);
    expect(roundProduct(Number.NaN, 2, 'LINE_AMOUNT')).toBeNaN();
    expect(roundProduct(Number.POSITIVE_INFINITY, 2, 'LINE_AMOUNT')).toBe(Number.POSITIVE_INFINITY);
    expect(roundPercentOf(100.3, 15, 'VAT_AMOUNT')).toBe(15.05);
    expect(roundPercentOf(100.2, 15, 'VAT_AMOUNT')).toBe(15.03);
    expect(roundPercentOf(-100.3, 15, 'VAT_AMOUNT')).toBe(-15.05);
    expect(roundPercentOf(100.3, 0, 'VAT_AMOUNT')).toBe(0);
  });

  it('the oracle is exact: it hits a known tie and leaves a known non tie', () => {
    // 100.30 x 15% = 15.045 is a tie and rounds to 15.05; 100.20 x 15% = 15.03 is exact.
    expect(divideHalfAway(10_030 * STANDARD_RATE, 100)).toBe(1_505);
    expect(divideHalfAway(10_020 * STANDARD_RATE, 100)).toBe(1_503);
    expect(divideHalfAway(-10_030 * STANDARD_RATE, 100)).toBe(-1_505);
    expect((10_030 * STANDARD_RATE) % 100).toBe(50);
    expect((10_020 * STANDARD_RATE) % 100).toBe(0);
  });
});
