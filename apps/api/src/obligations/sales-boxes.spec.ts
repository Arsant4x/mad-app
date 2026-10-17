import { salesBoxesFromLines } from './obligations.service';

/**
 * The return reads the line net after its discount, the same figure the ledger posts and the
 * stamped document carries, so box 1, the proportional ratio and the monthly threshold agree with them.
 */
describe('salesBoxesFromLines reads the line discount', () => {
  const line = (overrides: Record<string, unknown>) => ({
    quantity: 1,
    unitPrice: 1000,
    discount: 100,
    taxRate: 15,
    taxCategory: 'S',
    taxExemptionReasonCode: null,
    taxExemptionReason: null,
    ...overrides,
  });

  it('puts the discounted net and its VAT in box 1', () => {
    const boxes = salesBoxesFromLines([{ sign: 1, exchangeRate: 1, lines: [line({})] }]);
    expect(boxes.box1).toEqual({ net: 900, vat: 135 });
  });

  it('nets the discount on exempt lines and on a credit note', () => {
    const boxes = salesBoxesFromLines([
      { sign: 1, exchangeRate: 1, lines: [line({ taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29', discount: 40 })] },
      { sign: -1, exchangeRate: 1, lines: [line({ discount: 200 })] },
    ]);
    expect(boxes.box5).toEqual({ net: 960 });
    expect(boxes.box1).toEqual({ net: -800, vat: -120 });
  });

  it('counts a legacy standard line at its discounted net', () => {
    const boxes = salesBoxesFromLines([{ sign: 1, exchangeRate: 1, lines: [line({ taxCategory: 'LEGACY_STANDARD' })] }]);
    expect(boxes.legacyStandard).toEqual({ lineCount: 1, net: 900 });
    expect(boxes.box1.net).toBe(900);
  });

  it('keeps a line without discount at quantity times price', () => {
    const boxes = salesBoxesFromLines([{ sign: 1, exchangeRate: 1, lines: [line({ discount: 0, quantity: 2 })] }]);
    expect(boxes.box1).toEqual({ net: 2000, vat: 300 });
  });
});
