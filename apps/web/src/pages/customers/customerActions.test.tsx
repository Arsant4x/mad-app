import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton, rowMenuLabels } from '../../test/rowMenu';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/customers', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listCustomers: vi.fn() }));
vi.mock('../../api/invoices', () => ({ listInvoices: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

const { listCustomers } = await import('../../api/customers');
const { CustomersPage } = await import('./CustomersPage');

beforeEach(() => {
  resetGrants('customers:view');
  vi.mocked(listCustomers).mockResolvedValue([
    { id: 'c1', name: 'Old buyer', kind: 'LEGACY_UNDECLARED', vatNumber: null, phone: null, creditLimit: '0.00', outstanding: '0.00', archived: false },
  ] as never);
});

describe('Customers controls follow the actions', () => {
  it('a view only employee reads the details and gets no new, edit, archive, delete or kind declaration', async () => {
    render(<CustomersPage />);
    await screen.findByText(/Old buyer/);
    expect(hasButton(i18n.t('customers.page.new'))).toBe(false);
    expect(hasButton(i18n.t('customers.page.declare_kind'))).toBe(false);
    expect(rowMenuLabels()).toEqual([i18n.t('customers.page.action.details')]);
  });

  it('each action shows its own control', async () => {
    grants.add('customers:add').add('customers:edit').add('customers:delete');
    render(<CustomersPage />);
    await screen.findByText(/Old buyer/);
    expect(hasButton(i18n.t('customers.page.new'))).toBe(true);
    expect(hasButton(i18n.t('customers.page.declare_kind'))).toBe(true);
    expect(rowMenuLabels()).toEqual([
      i18n.t('customers.page.action.details'),
      i18n.t('customers.page.action.edit'),
      i18n.t('customers.page.action.archive'),
      i18n.t('customers.page.action.delete'),
    ]);
  });
});
