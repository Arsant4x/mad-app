import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton } from '../../test/rowMenu';

// File budget: one page render with every API mocked, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

const shift = { id: 's1', openedByName: 'Cashier', salesCount: 0, expectedCash: '0.00', branchId: null };
const product = { id: 'p1', name: 'Tea', price: '5.00', taxCategory: 'S', taxExemptionReasonCode: null, taxExemptionReason: null, sku: null, barcode: null };

vi.mock('../../api/products', () => ({ listProducts: vi.fn(() => Promise.resolve([product])) }));
vi.mock('../../api/branches', () => ({ listBranches: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../api/companyProfile', () => ({ getCompanyProfile: vi.fn(() => Promise.resolve({ legalName: 'Seller', vatNumber: '300000000000003' })) }));
vi.mock('../../api/pos', () => ({
  chargePaymentAttempt: vi.fn(),
  closeShift: vi.fn(),
  createPaymentAttempt: vi.fn(),
  getCurrentShift: vi.fn(),
  getPaymentMode: vi.fn(() => Promise.resolve({ linkActive: false })),
  listCardVerifications: vi.fn(),
  listOpenPaymentAttempts: vi.fn(() => Promise.resolve([])),
  openShift: vi.fn(),
  resolvePaymentAttempt: vi.fn(),
  resolvePaymentAttemptWithEvidence: vi.fn(),
  syncPosSale: vi.fn(),
}));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ user: { actorType: 'COMPANY_USER', companyId: 'c1' } }) }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

const { getCurrentShift } = await import('../../api/pos');
const { PosPage } = await import('./PosPage');

beforeEach(() => resetGrants('pos:view'));

/** Opening a shift and selling record; closing the shift reviews. */
describe('Cashier controls follow record and review', () => {
  it('without a shift, opening one needs record', async () => {
    vi.mocked(getCurrentShift).mockResolvedValue(null);
    const { unmount } = render(<PosPage />);
    await screen.findByText(i18n.t('pos.title'));
    expect(hasButton(i18n.t('pos.open.button'))).toBe(false);
    unmount();
    grants.add('pos:record');
    render(<PosPage />);
    expect(await screen.findByText(i18n.t('pos.open.button'))).toBeTruthy();
  });

  it('in a shift, a view only employee cannot pay or close', async () => {
    vi.mocked(getCurrentShift).mockResolvedValue(shift as never);
    render(<PosPage />);
    await screen.findByText('Tea');
    expect(hasButton(i18n.t('pos.pay.cash'))).toBe(false);
    expect(hasButton(i18n.t('pos.pay.card'))).toBe(false);
    expect(hasButton(i18n.t('pos.pay.split'))).toBe(false);
    expect(hasButton(i18n.t('pos.shift.close_button'))).toBe(false);
  });

  it('record pays without closing the shift, review closes it', async () => {
    vi.mocked(getCurrentShift).mockResolvedValue(shift as never);
    grants.add('pos:record');
    const { unmount } = render(<PosPage />);
    await screen.findByText('Tea');
    expect(hasButton(i18n.t('pos.pay.cash'))).toBe(true);
    expect(hasButton(i18n.t('pos.pay.split'))).toBe(true);
    expect(hasButton(i18n.t('pos.shift.close_button'))).toBe(false);
    unmount();
    resetGrants('pos:view', 'pos:review');
    render(<PosPage />);
    await screen.findByText('Tea');
    expect(hasButton(i18n.t('pos.shift.close_button'))).toBe(true);
    expect(hasButton(i18n.t('pos.pay.cash'))).toBe(false);
  });
});
