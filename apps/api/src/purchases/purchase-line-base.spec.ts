import { purchaseLineBase, stockedBaseOf } from './goods-receipts.service';

describe('a purchase line in the base currency is the exact decimal product rounded once', () => {
  it('0.375 x 0.6 at rate 1 is 0.225 exactly and gives 0.23, not the binary 0.22', () => {
    expect(purchaseLineBase({ quantity: 0.375, unitPrice: 0.6 }, 1)).toBe(0.23);
  });

  it('1 x 0.375 at rate 0.6 is 0.225 exactly and gives 0.23', () => {
    expect(purchaseLineBase({ quantity: 1, unitPrice: 0.375 }, 0.6)).toBe(0.23);
  });

  it('a value just under the half still rounds down, and a negative tie rounds away from zero', () => {
    expect(purchaseLineBase({ quantity: 0.374, unitPrice: 0.6 }, 1)).toBe(0.22);
    expect(purchaseLineBase({ quantity: -0.375, unitPrice: 0.6 }, 1)).toBe(-0.23);
  });

  it('the stocked base sums the exact stocked lines', () => {
    const lines = [
      { id: 'a', productId: 'p', quantity: 0.375, unitPrice: 0.6, batchNo: null, expiryDate: null },
      { id: 'b', productId: null, quantity: 1, unitPrice: 5, batchNo: null, expiryDate: null },
    ];
    expect(stockedBaseOf(lines, 1)).toBe(0.23);
  });
});
