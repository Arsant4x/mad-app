import type { CreatePosSaleDto } from './dto/pos.dto';
import { isSameSale, type RecordedSale } from './sale-replay.util';

const WALK_IN = 'walk-in';

const recorded = (over: Partial<RecordedSale> = {}): RecordedSale => ({
  customerId: 'walk-in-id',
  customer: { name: WALK_IN },
  paymentMethod: 'CASH',
  lines: [
    { productId: 'p1', quantity: '2.000', discount: '0.00' },
    { productId: 'p2', quantity: '1.500', discount: '5.00' },
  ],
  posPayments: [{ method: 'CASH', amount: '120.00' }],
  ...over,
});

const request = (over: Partial<CreatePosSaleDto> = {}): CreatePosSaleDto =>
  ({
    lines: [
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', quantity: 1.5, discount: 5 },
    ],
    paymentMethod: 'CASH',
    ...over,
  }) as CreatePosSaleDto;

describe('isSameSale: a known sale id answers only the sale it recorded', () => {
  it('the same sale sent again is the same sale, with stored decimals and an absent discount read as zero', () => {
    expect(isSameSale(recorded(), request(), WALK_IN)).toBe(true);
  });

  it('a different quantity, product, line count or line order is another sale', () => {
    expect(isSameSale(recorded(), request({ lines: [{ productId: 'p1', quantity: 3 }, { productId: 'p2', quantity: 1.5, discount: 5 }] }), WALK_IN)).toBe(false);
    expect(isSameSale(recorded(), request({ lines: [{ productId: 'p9', quantity: 2 }, { productId: 'p2', quantity: 1.5, discount: 5 }] }), WALK_IN)).toBe(false);
    expect(isSameSale(recorded(), request({ lines: [{ productId: 'p1', quantity: 2 }] }), WALK_IN)).toBe(false);
    expect(isSameSale(recorded(), request({ lines: [{ productId: 'p2', quantity: 1.5, discount: 5 }, { productId: 'p1', quantity: 2 }] }), WALK_IN)).toBe(false);
    expect(isSameSale(recorded(), request({ lines: [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1.5, discount: 4 }] }), WALK_IN)).toBe(false);
  });

  it('another buyer or payment method is another sale', () => {
    expect(isSameSale(recorded(), request({ customerId: 'named' }), WALK_IN)).toBe(false);
    expect(isSameSale(recorded({ customerId: 'named', customer: { name: 'Named' } }), request(), WALK_IN)).toBe(false);
    expect(isSameSale(recorded({ customerId: 'named', customer: { name: 'Named' } }), request({ customerId: 'named' }), WALK_IN)).toBe(true);
    expect(isSameSale(recorded(), request({ paymentMethod: 'CARD' }), WALK_IN)).toBe(false);
  });

  it('a split sale compares its parts in any order', () => {
    const split = recorded({ paymentMethod: 'SPLIT', posPayments: [{ method: 'CASH', amount: '70.00' }, { method: 'CARD', amount: '50.00' }] });
    const parts = (a: number, b: number) => request({ paymentMethod: 'SPLIT', payments: [{ method: 'CARD', amount: a }, { method: 'CASH', amount: b }] });
    expect(isSameSale(split, parts(50, 70), WALK_IN)).toBe(true);
    expect(isSameSale(split, parts(60, 60), WALK_IN)).toBe(false);
  });
});
