import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// File budget: one page render with every API mocked.
vi.setConfig({ testTimeout: 10_000 });

const shift = { id: 's1', openedByName: 'Cashier', salesCount: 0, expectedCash: '0.00', branchId: null };
const product = { id: 'p1', name: 'Tie item', price: '100.30', taxCategory: 'S', taxExemptionReasonCode: null, taxExemptionReason: null, sku: null, barcode: null };

vi.mock('../../api/products', () => ({ listProducts: vi.fn(() => Promise.resolve([product])) }));
vi.mock('../../api/branches', () => ({ listBranches: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../api/companyProfile', () => ({ getCompanyProfile: vi.fn(() => Promise.resolve({ legalName: 'Seller', vatNumber: '300000000000003' })) }));
vi.mock('../../api/pos', () => ({
  chargePaymentAttempt: vi.fn(),
  closeShift: vi.fn(),
  createPaymentAttempt: vi.fn(),
  getCurrentShift: vi.fn(() => Promise.resolve(shift)),
  getPaymentMode: vi.fn(() => Promise.resolve({ linkActive: false })),
  listCardVerifications: vi.fn(),
  listOpenPaymentAttempts: vi.fn(() => Promise.resolve([])),
  openShift: vi.fn(),
  resolvePaymentAttempt: vi.fn(),
  resolvePaymentAttemptWithEvidence: vi.fn(),
  syncPosSale: vi.fn(),
}));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ user: { actorType: 'COMPANY', companyId: 'c1' } }) }));
vi.mock('../../auth/PermissionsContext', () => ({ usePermissions: () => ({ can: () => true }) }));

const { PosPage } = await import('./PosPage');
const ar = (await import('../../i18n/locales/ar/pos.json')).default;

/** The value cell of the cart totals row whose label is `label`. */
function cartCell(label: string): string {
  const row = screen.getByText(label).closest('tr');
  return row?.querySelectorAll('td')[1]?.textContent ?? '';
}

describe('the cashier cart shows the totals the server stores', () => {
  it('100.30 at 15% shows the tax 15.05 and the total 115.35, the per rate tax on the decimal value', async () => {
    render(<PosPage />);
    fireEvent.click(await screen.findByText('Tie item'));
    await waitFor(() => expect(cartCell(ar.cart.subtotal)).toBe('100.30'));
    expect({ tax: cartCell(ar.cart.tax), total: cartCell(ar.cart.total) }).toEqual({ tax: '15.05', total: '115.35' });
  });
});
