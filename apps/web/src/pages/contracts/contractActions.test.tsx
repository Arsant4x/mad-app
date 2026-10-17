import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contract } from '../../api/contracts';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton } from '../../test/rowMenu';
import { ClaimsSection } from './ClaimsSection';
import { DepositsSection } from './DepositsSection';
import { FeesSection } from './FeesSection';
import { HandoversSection } from './HandoversSection';
import { KeyMoneySection } from './KeyMoneySection';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

const contract = {
  id: 'c1',
  unitId: 'u1',
  unit: { id: 'u1', unitNo: '101', property: { id: 'p1', name: 'Tower', ownership: 'owned' } },
  customerId: null,
  no: 'EJ-1',
  ejarNo: null,
  tenant: 'Tenant',
  phone: null,
  value: '12000.00',
  cycle: 'monthly',
  start: '2026-01-01',
  end: '2026-12-31',
  deposit: '0.00',
  services: null,
  furnished: null,
  classification: 'RESIDENTIAL',
  vatInclusion: 'INCLUSIVE',
  lessor: 'COMPANY',
  ownerName: null,
  ownerVatNumber: null,
  exemptSharePercent: null,
  exemptShareBasis: null,
  status: 'DUE',
  cancelDate: null,
  cancelReason: null,
  settlementAmount: null,
  settlementEntryId: null,
  renewedFromId: null,
  installments: [{ id: 'i1', dueDate: '2026-01-01', amount: '1000.00', status: 'DUE', notes: null }],
  payments: [],
  deposits: [{ id: 'dp1', type: 'RENT', holder: 'COMPANY', amount: '500.00', receivedAt: '2026-01-01', status: 'HELD', deductions: [], refundAmount: null, note: null }],
  claims: [{ id: 'cl1', kind: 'MAINTENANCE', description: 'Fix', amount: '100.00', taxAmount: '15.00', issuedAt: '2026-02-01', status: 'OPEN', taxTreatment: 'TAXABLE_SERVICE', waiveReason: null, settledAt: null }],
  fees: [{ id: 'f1', label: 'Parking', amount: '50.00', effectiveFrom: '2026-01-01', endedAt: null }],
  keyMoney: [],
  handovers: [{ id: 'h1', type: 'DELIVERY', status: 'DRAFT', date: '2026-01-01', electricityMeter: null, waterMeter: null, notes: null, signedAt: null, signedBy: null, photoNoticeYears: null, photoNoticeAt: null, items: [] }],
  claimsOutstanding: '115.00',
  depositsHeld: '500.00',
} as unknown as Contract;

const noop = () => {};

beforeEach(() => resetGrants('contracts:view'));

describe('Contract sections follow the actions', () => {
  it('claims: add raises and attaches, record collects, review waives', () => {
    const { unmount } = render(<ClaimsSection contract={contract} onChanged={noop} />);
    expect(hasButton(i18n.t('contracts.claims.add'))).toBe(false);
    expect(hasButton(i18n.t('contracts.claims.collect'))).toBe(false);
    expect(hasButton(i18n.t('contracts.claims.waive'))).toBe(false);
    unmount();
    grants.add('contracts:add').add('contracts:record').add('contracts:review');
    render(<ClaimsSection contract={contract} onChanged={noop} />);
    expect(hasButton(i18n.t('contracts.claims.add'))).toBe(true);
    expect(hasButton(i18n.t('contracts.claims.collect'))).toBe(true);
    expect(hasButton(i18n.t('contracts.claims.waive'))).toBe(true);
  });

  it('deposits: record receives, review settles', () => {
    const { unmount } = render(<DepositsSection contract={contract} onChanged={noop} />);
    expect(hasButton(i18n.t('contracts.deposits.add'))).toBe(false);
    expect(hasButton(i18n.t('contracts.deposits.settle'))).toBe(false);
    unmount();
    grants.add('contracts:record');
    const second = render(<DepositsSection contract={contract} onChanged={noop} />);
    expect(hasButton(i18n.t('contracts.deposits.add'))).toBe(true);
    expect(hasButton(i18n.t('contracts.deposits.settle'))).toBe(false);
    second.unmount();
    grants.add('contracts:review');
    render(<DepositsSection contract={contract} onChanged={noop} />);
    expect(hasButton(i18n.t('contracts.deposits.settle'))).toBe(true);
  });

  it('fees: adding and ending a line both need edit', () => {
    const { unmount } = render(<FeesSection contract={contract} onChanged={noop} />);
    expect(hasButton(i18n.t('contracts.fees.add'))).toBe(false);
    expect(hasButton(i18n.t('contracts.fees.end'))).toBe(false);
    unmount();
    grants.add('contracts:edit');
    render(<FeesSection contract={contract} onChanged={noop} />);
    expect(hasButton(i18n.t('contracts.fees.add'))).toBe(true);
    expect(hasButton(i18n.t('contracts.fees.end'))).toBe(true);
  });

  it('key money needs record', () => {
    const { unmount } = render(<KeyMoneySection contract={contract} onChanged={noop} />);
    expect(hasButton(i18n.t('contracts.key_money.add'))).toBe(false);
    unmount();
    grants.add('contracts:record');
    render(<KeyMoneySection contract={contract} onChanged={noop} />);
    expect(hasButton(i18n.t('contracts.key_money.add'))).toBe(true);
  });

  it('handovers: add creates, edit edits, review signs, delete deletes; photos stay viewable', () => {
    const { unmount } = render(<HandoversSection contract={contract} onChanged={noop} />);
    expect(hasButton(i18n.t('contracts.handovers.new'))).toBe(false);
    expect(hasButton(i18n.t('contracts.handovers.edit'))).toBe(false);
    expect(hasButton(i18n.t('contracts.handovers.sign'))).toBe(false);
    expect(hasButton(i18n.t('contracts.handovers.delete'))).toBe(false);
    expect(hasButton(i18n.t('contracts.handovers.photos'))).toBe(true);
    unmount();
    grants.add('contracts:add').add('contracts:edit').add('contracts:review').add('contracts:delete');
    render(<HandoversSection contract={contract} onChanged={noop} />);
    expect(hasButton(i18n.t('contracts.handovers.new'))).toBe(true);
    expect(hasButton(i18n.t('contracts.handovers.edit'))).toBe(true);
    expect(hasButton(i18n.t('contracts.handovers.sign'))).toBe(true);
    expect(hasButton(i18n.t('contracts.handovers.delete'))).toBe(true);
  });
});
