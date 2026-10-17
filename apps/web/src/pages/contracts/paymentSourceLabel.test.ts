import { describe, expect, it, vi } from 'vitest';
import { paymentSourceLabel } from './ContractDetailModal';

// A first estimate before it is measured under the suite's load.
vi.setConfig({ testTimeout: 15_000 });

/**
 * A payment row names where its money came from. Unpaid rent taken from a deposit and a deduction from the tenant credit
 * are payments without cash today, so neither is shown as a cash receipt.
 */
describe('Where a rent payment came from', () => {
  it('names a deduction from the deposit, the tenant credit, or the method of a receipt', () => {
    expect({
      deposit: paymentSourceLabel({ method: 'CASH', depositId: 'd1', creditFromContractId: null }),
      credit: paymentSourceLabel({ method: 'CASH', depositId: null, creditFromContractId: 'c0' }),
      cash: paymentSourceLabel({ method: 'CASH', depositId: null, creditFromContractId: null }),
      bank: paymentSourceLabel({ method: 'BANK' }),
    }).toEqual({ deposit: 'خصمٌ من التأمين', credit: 'خصمٌ من رصيد المستأجر', cash: 'نقداً', bank: 'تحويل بنكي' });
  });
});
