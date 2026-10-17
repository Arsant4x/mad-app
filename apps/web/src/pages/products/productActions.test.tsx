import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton, rowMenuLabels } from '../../test/rowMenu';
import { ProductsPage } from './ProductsPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/products', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listProducts: vi.fn() }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

import { listProducts } from '../../api/products';

beforeEach(() => {
  resetGrants('products:view');
  vi.mocked(listProducts).mockResolvedValue([
    { id: 'p1', name: 'Tea', sku: null, category: null, unitCode: null, price: '5.00', cost: '2.00', barcode: null, archived: false, expiryTracked: false, taxCategory: 'S', taxRate: '15', taxExemptionReason: null },
  ] as never);
});

describe('Products controls follow the actions', () => {
  it('a view only employee gets no new button and no row actions', async () => {
    render(<ProductsPage />);
    await screen.findByText('Tea');
    expect(hasButton(i18n.t('products.list.new'))).toBe(false);
    expect(rowMenuLabels()).toEqual([]);
  });

  it('each action shows its own control', async () => {
    grants.add('products:add').add('products:edit').add('products:delete');
    render(<ProductsPage />);
    await screen.findByText('Tea');
    expect(hasButton(i18n.t('products.list.new'))).toBe(true);
    expect(rowMenuLabels()).toEqual([i18n.t('products.list.edit'), i18n.t('products.list.archive'), i18n.t('products.list.delete')]);
  });
});
