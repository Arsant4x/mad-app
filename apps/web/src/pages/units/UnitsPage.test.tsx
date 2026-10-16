import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reservation } from '../../api/reservations';
import type { Unit } from '../../api/units';
import i18n from '../../i18n';
import { UnitsPage } from './UnitsPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/units', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listUnits: vi.fn(),
}));
vi.mock('../../api/properties', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listProperties: vi.fn(),
}));
vi.mock('../../api/reservations', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listReservations: vi.fn(),
}));
const grants = new Set<string>();
vi.mock('../../auth/PermissionsContext', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePermissions: () => ({ can: (screen: string, action: string) => grants.has(`${screen}:${action}`) }),
}));

import { listProperties } from '../../api/properties';
import { listReservations } from '../../api/reservations';
import { listUnits } from '../../api/units';

const unit = {
  archived: false,
  id: 'u1',
  propertyId: 'p1',
  unitNo: '101',
  floor: null,
  type: 'APARTMENT',
  subtype: null,
  rentMonthly: '1000.00',
  underMaintenance: false,
  status: 'reserved',
  currentTenant: null,
  reservedBy: 'Buyer',
  upcomingTenant: null,
  roomDetails: null,
} as Unit;

const reservation = {
  id: 'r1',
  unitId: 'u1',
  name: 'Buyer',
  phone: null,
  deposit: '0',
  expiryDate: '2026-12-31T00:00:00.000Z',
  status: 'ACTIVE',
  createdAt: '2026-10-01T00:00:00.000Z',
  unit: { ...unit, property: { name: 'Tower' } },
} as Reservation;

async function menuLabels(): Promise<string[]> {
  render(<UnitsPage />);
  await waitFor(() => expect(screen.getByText('101')).toBeTruthy());
  fireEvent.click(screen.getByTitle(i18n.t('common.row_menu.options')));
  return [...document.querySelectorAll('.action-menu button')].map((b) => (b.textContent ?? '').trim());
}

beforeEach(() => {
  vi.clearAllMocks();
  grants.clear();
  vi.mocked(listUnits).mockResolvedValue([unit]);
  vi.mocked(listProperties).mockResolvedValue([{ id: 'p1', name: 'Tower' }] as never);
  vi.mocked(listReservations).mockResolvedValue([reservation]);
});

/** Cancelling a reservation needs delete on properties; without it the server refuses, so the menu does not offer it. */
describe('Cancelling a reservation follows the delete action', () => {
  it('hides cancel reservation from a view only employee', async () => {
    grants.add('properties:view');
    expect(await menuLabels()).not.toContain(i18n.t('units.page.action_cancel_reservation'));
  });

  it('shows cancel reservation with delete', async () => {
    grants.add('properties:view').add('properties:delete');
    expect(await menuLabels()).toContain(i18n.t('units.page.action_cancel_reservation'));
  });
});
