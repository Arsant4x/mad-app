import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PurchaseModal } from './PurchaseModal';

// File budget: two hundred input changes, measured below two seconds under the full suite; three times that.
vi.setConfig({ testTimeout: 6_000 });

/**
 * The purchase form previews the tax and the total before saving. The server stores the tax as the
 * subtotal times the rate rounded half away from zero on the exact decimal, so the preview must show
 * that same number. The oracle works in whole halalas, so it is exact.
 */
const RATE = 15;

/** n / d for integers with d > 0, rounded half away from zero. */
const divideHalfAway = (n: number, d: number) => Math.sign(n) * Math.floor((Math.abs(n) + d / 2) / d);

function renderForm() {
  const view = render(
    <PurchaseModal suppliers={[]} branches={[]} editing={null} onCancel={() => {}} onSave={async () => {}} onCreateSupplier={async () => ({ id: 's', name: 's' }) as never} />,
  );
  const input = view.getByPlaceholderText('0.00') as HTMLInputElement;
  const shown = () => {
    const [tax, total] = [...view.container.querySelectorAll('b.num')].map((b) => Number((b.textContent ?? '').replace(/,/g, '')));
    return { tax, total };
  };
  const enter = (value: string) => {
    fireEvent.change(input, { target: { value } });
    return shown();
  };
  return { enter };
}

describe('PurchaseModal tax preview', () => {
  it('shows the tax and total the server stores on half halala ties: 33.30 gives 5.00 and 38.30', () => {
    const { enter } = renderForm();
    expect(enter('33.30')).toEqual({ tax: 5, total: 38.3 });
    expect(enter('4.10')).toEqual({ tax: 0.62, total: 4.72 });
    expect(enter('100.30')).toEqual({ tax: 15.05, total: 115.35 });
    // Not a tie: 100.20 x 15% is 15.03 exactly.
    expect(enter('100.20')).toEqual({ tax: 15.03, total: 115.23 });
  });

  // Every tie up to 10,000.00 is checked on netTotals in lib/money.test.ts; this sweep proves the form shows it.
  it('shows the server tax on every half halala tie from 0.10 to 40.00', () => {
    const { enter } = renderForm();
    const misses: { input: string; expected: { tax: number; total: number }; got: { tax: number; total: number } }[] = [];
    let checked = 0;
    for (let halalas = 10; halalas <= 4_000; halalas += 20) {
      checked++;
      const tax = divideHalfAway(halalas * RATE, 100);
      const expected = { tax: tax / 100, total: (halalas + tax) / 100 };
      const input = `${Math.floor(halalas / 100)}.${String(halalas % 100).padStart(2, '0')}`;
      const got = enter(input);
      if (got.tax !== expected.tax || got.total !== expected.total) misses.push({ input, expected, got });
    }
    expect({ checked, misses: misses.length, first: misses.slice(0, 3) }).toEqual({ checked: 200, misses: 0, first: [] });
  });
});
