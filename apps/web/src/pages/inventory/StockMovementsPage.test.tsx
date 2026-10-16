import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockMovement } from '../../api/inventory';
import type { Product } from '../../api/products';
import type { Warehouse } from '../../api/warehouses';
import i18n from '../../i18n';
import { StockMovementsPage } from './StockMovementsPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/inventory', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listStockMovements: vi.fn(),
  reverseStockMovement: vi.fn(),
}));
vi.mock('../../api/products', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listProducts: vi.fn(),
}));
vi.mock('../../api/warehouses', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listWarehouses: vi.fn(),
}));
const grants = new Set<string>();
vi.mock('../../auth/PermissionsContext', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePermissions: () => ({ can: (screen: string, action: string) => grants.has(`${screen}:${action}`) }),
}));

import { listStockMovements, reverseStockMovement } from '../../api/inventory';
import { listProducts } from '../../api/products';
import { listWarehouses } from '../../api/warehouses';

const product = { id: 'p1', name: 'Widget', sku: null, expiryTracked: false } as Product;
const warehouse = { id: 'w1', name: 'Main store' } as Warehouse;
const movement = {
  id: 'sm1',
  productId: 'p1',
  product,
  warehouseId: 'w1',
  warehouse,
  toWarehouseId: null,
  toWarehouse: null,
  type: 'IN',
  qty: '5',
  reason: null,
  date: '2026-10-01',
} as StockMovement;

const newButton = () => screen.queryByRole('button', { name: i18n.t('inventory.movements.new') });
const menuButton = () => screen.queryByTitle(i18n.t('common.row_menu.options'));

async function mount() {
  render(<StockMovementsPage />);
  await waitFor(() => expect(screen.getByText('Widget')).toBeTruthy());
}

beforeEach(() => {
  vi.clearAllMocks();
  grants.clear();
  vi.mocked(listStockMovements).mockResolvedValue({ items: [movement], total: 1, page: 1, pageSize: 25 });
  vi.mocked(listProducts).mockResolvedValue([product]);
  vi.mocked(listWarehouses).mockResolvedValue([warehouse]);
});

/** A new movement needs record and a reversal needs delete on inventory; the page offers each only with its action. */
describe('Stock movement controls follow the actions the server requires', () => {
  it('hides the new movement button and the reverse item from a view only employee', async () => {
    grants.add('inventory:view');
    await mount();
    expect(newButton()).toBeNull();
    expect(menuButton()).toBeNull();
  });

  it('shows the new movement button with record and the reverse item with delete', async () => {
    grants.add('inventory:view').add('inventory:record').add('inventory:delete');
    await mount();
    expect(newButton()).not.toBeNull();
    fireEvent.click(menuButton()!);
    expect(screen.queryByRole('button', { name: i18n.t('inventory.movements.reverse_action') })).not.toBeNull();
  });

  it('shows the server message when a reversal is refused', async () => {
    grants.add('inventory:view').add('inventory:delete');
    const refusal = 'The cost layer of this movement has been consumed';
    vi.mocked(reverseStockMovement).mockRejectedValue({ response: { status: 409, data: { message: refusal } } });
    await mount();
    fireEvent.click(menuButton()!);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('inventory.movements.reverse_action') }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('inventory.movements.reverse_confirm') }));
    await waitFor(() => expect(screen.queryByText(refusal)).not.toBeNull());
  });
});
