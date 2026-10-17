import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaintenanceRequest } from '../../api/maintenance';
import i18n from '../../i18n';
import { MaintenancePage } from './MaintenancePage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/maintenance', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listMaintenance: vi.fn(),
}));
vi.mock('../../api/properties', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listProperties: vi.fn(),
}));
vi.mock('../../api/units', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listUnits: vi.fn(),
}));
// The task button checks its own permission and needs the auth context; it is not what this file measures.
vi.mock('../../components/AssignTaskButton', () => ({ AssignTaskButton: () => null }));
const grants = new Set<string>();
vi.mock('../../auth/PermissionsContext', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePermissions: () => ({ can: (screen: string, action: string) => grants.has(`${screen}:${action}`) }),
}));

import { listMaintenance } from '../../api/maintenance';
import { listProperties } from '../../api/properties';
import { listUnits } from '../../api/units';

const request = {
  id: 'm1',
  propertyId: 'p1',
  property: { id: 'p1', name: 'Tower' },
  unitId: null,
  unit: null,
  title: 'Leaking pipe',
  description: null,
  priority: 'NORMAL',
  status: 'REPORTED',
  reportedBy: null,
  reportedAt: '2026-10-01',
  assignedTo: null,
  startedAt: null,
  completedAt: null,
  closedAt: null,
  cancelReason: null,
  cost: null,
  currency: 'SAR',
  journalEntryId: null,
  notes: null,
} as MaintenanceRequest;

const button = (key: string) => screen.queryByRole('button', { name: i18n.t(key) });

async function mount() {
  render(<MaintenancePage />);
  await waitFor(() => expect(screen.getByText('Leaking pipe')).toBeTruthy());
}

beforeEach(() => {
  vi.clearAllMocks();
  grants.clear();
  vi.mocked(listMaintenance).mockResolvedValue([request]);
  vi.mocked(listProperties).mockResolvedValue([{ id: 'p1', name: 'Tower' }] as never);
  vi.mocked(listUnits).mockResolvedValue([]);
});

/** Assign and start need edit, cancel needs delete: the server refuses them otherwise, so the row does not offer them. */
describe('Maintenance row actions follow the actions the server requires', () => {
  it('hides assign, start and cancel from a view only employee', async () => {
    grants.add('maintenance:view');
    await mount();
    expect(button('maintenance.page.action_assign')).toBeNull();
    expect(button('maintenance.page.action_start')).toBeNull();
    expect(button('maintenance.page.action_cancel')).toBeNull();
  });

  it('shows assign and start with edit, and still not cancel', async () => {
    grants.add('maintenance:view').add('maintenance:edit');
    await mount();
    expect(button('maintenance.page.action_assign')).not.toBeNull();
    expect(button('maintenance.page.action_start')).not.toBeNull();
    expect(button('maintenance.page.action_cancel')).toBeNull();
  });

  it('shows cancel with delete, and not assign or start', async () => {
    grants.add('maintenance:view').add('maintenance:delete');
    await mount();
    expect(button('maintenance.page.action_cancel')).not.toBeNull();
    expect(button('maintenance.page.action_assign')).toBeNull();
    expect(button('maintenance.page.action_start')).toBeNull();
  });
});

/** A new request adds, complete records and close reviews. */
describe('New, complete and close follow add, record and review', () => {
  it('the new request button needs add', async () => {
    grants.add('maintenance:view');
    await mount();
    expect(button('maintenance.page.new')).toBeNull();
  });

  it('shows the new request button with add', async () => {
    grants.add('maintenance:view').add('maintenance:add');
    await mount();
    expect(button('maintenance.page.new')).not.toBeNull();
  });

  it('complete needs record on a request in progress', async () => {
    vi.mocked(listMaintenance).mockResolvedValue([{ ...request, status: 'IN_PROGRESS' }]);
    grants.add('maintenance:view');
    await mount();
    expect(button('maintenance.page.action_complete')).toBeNull();
    cleanup();
    grants.add('maintenance:record');
    await mount();
    expect(button('maintenance.page.action_complete')).not.toBeNull();
  });

  it('close needs review on a finished request', async () => {
    vi.mocked(listMaintenance).mockResolvedValue([{ ...request, status: 'DONE' }]);
    // A finished request is listed under its own filter, not under the open ones.
    const mountDone = async () => {
      render(<MaintenancePage />);
      fireEvent.click(await screen.findByText(i18n.t('maintenance.page.filter_done')));
      await screen.findByText('Leaking pipe');
    };
    grants.add('maintenance:view');
    await mountDone();
    expect(button('maintenance.page.action_close')).toBeNull();
    cleanup();
    grants.add('maintenance:review');
    await mountDone();
    expect(button('maintenance.page.action_close')).not.toBeNull();
  });
});
