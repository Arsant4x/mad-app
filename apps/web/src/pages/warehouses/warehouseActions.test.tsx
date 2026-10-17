import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton, rowMenuLabels } from '../../test/rowMenu';
import { WarehousesPage } from './WarehousesPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/warehouses', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listWarehouses: vi.fn() }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

import { listWarehouses } from '../../api/warehouses';

beforeEach(() => {
  resetGrants('inventory:view');
  vi.mocked(listWarehouses).mockResolvedValue([{ id: 'w1', name: 'Main store', location: null, manager: null, itemCount: 1, totalQty: '4', archived: false, otherBranch: false }] as never);
});

/** Warehouses live on the inventory screen and follow its add, edit and delete. */
describe('Warehouses controls follow the actions', () => {
  it('a view only employee gets no new button and no row actions', async () => {
    render(<WarehousesPage />);
    await screen.findByText('Main store');
    expect(hasButton(i18n.t('warehouses.list.new'))).toBe(false);
    expect(rowMenuLabels()).toEqual([]);
  });

  it('each action shows its own control', async () => {
    grants.add('inventory:add').add('inventory:edit').add('inventory:delete');
    render(<WarehousesPage />);
    await screen.findByText('Main store');
    expect(hasButton(i18n.t('warehouses.list.new'))).toBe(true);
    expect(rowMenuLabels()).toEqual([i18n.t('warehouses.list.edit'), i18n.t('warehouses.list.archive'), i18n.t('warehouses.list.delete')]);
  });
});
