import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton, rowMenuLabels } from '../../test/rowMenu';
import { WarrantiesPage } from './WarrantiesPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/warranties', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listWarranties: vi.fn() }));
vi.mock('../../api/properties', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listProperties: vi.fn() }));
vi.mock('../../api/units', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listUnits: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

import { listProperties } from '../../api/properties';
import { listWarranties } from '../../api/warranties';

beforeEach(() => {
  resetGrants('maintenance:view');
  vi.mocked(listProperties).mockResolvedValue([{ id: 'p1', name: 'Tower' }] as never);
  vi.mocked(listWarranties).mockResolvedValue([
    { id: 'w1', subject: 'Lift', provider: 'Lifts Co', property: { id: 'p1', name: 'Tower' }, unit: null, startDate: '2026-01-01', endDate: '2027-01-01', reference: null, terms: null, notes: null, expired: false, daysLeft: 200 },
  ] as never);
});

/** Warranties live on the maintenance screen and follow its add, edit and delete. */
describe('Warranties controls follow the actions', () => {
  it('a view only employee gets no new button and no row actions', async () => {
    render(<WarrantiesPage />);
    await screen.findByText('Lift');
    expect(hasButton(i18n.t('warranties.page.new'))).toBe(false);
    expect(rowMenuLabels()).toEqual([]);
  });

  it('each action shows its own control', async () => {
    grants.add('maintenance:add').add('maintenance:edit').add('maintenance:delete');
    render(<WarrantiesPage />);
    await screen.findByText('Lift');
    expect(hasButton(i18n.t('warranties.page.new'))).toBe(true);
    expect(rowMenuLabels()).toEqual([i18n.t('warranties.page.action_edit'), i18n.t('warranties.page.action_delete')]);
  });
});
