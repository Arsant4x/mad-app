import { reducesInventoryValue } from './stock-movement-value';

describe('reducesInventoryValue', () => {
  it('is true for a stock out and a negative adjustment', () => {
    expect(reducesInventoryValue({ type: 'OUT', qty: 3 })).toBe(true);
    expect(reducesInventoryValue({ type: 'ADJUSTMENT', qty: -1 })).toBe(true);
  });

  it('is false for a stock in, a positive adjustment and a transfer', () => {
    expect(reducesInventoryValue({ type: 'IN', qty: 3 })).toBe(false);
    expect(reducesInventoryValue({ type: 'ADJUSTMENT', qty: 2 })).toBe(false);
    expect(reducesInventoryValue({ type: 'TRANSFER', qty: 4 })).toBe(false);
  });
});
