import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton, rowMenuLabels } from '../../test/rowMenu';
import { PropertiesPage } from './PropertiesPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/properties', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listProperties: vi.fn() }));
vi.mock('../../api/units', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listUnits: vi.fn(() => Promise.resolve([])) }));
// The map draws tiles and is not what this file measures.
vi.mock('./PropertiesMap', () => ({ PropertiesMap: () => null }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

import { listProperties } from '../../api/properties';

beforeEach(() => {
  resetGrants('properties:view');
  vi.mocked(listProperties).mockResolvedValue([{ id: 'p1', name: 'Tower', address: null, floors: 3, activityType: null, ownership: 'owned', archived: false }] as never);
});

describe('Properties controls follow the actions', () => {
  it('a view only employee gets no new button and no row actions', async () => {
    render(<PropertiesPage />);
    await screen.findByText('Tower');
    expect(hasButton(i18n.t('properties.page.new'))).toBe(false);
    expect(rowMenuLabels()).toEqual([]);
  });

  it('each action shows its own control', async () => {
    grants.add('properties:add').add('properties:edit').add('properties:delete');
    render(<PropertiesPage />);
    await screen.findByText('Tower');
    expect(hasButton(i18n.t('properties.page.new'))).toBe(true);
    expect(rowMenuLabels()).toEqual([i18n.t('properties.page.action_edit'), i18n.t('properties.page.action_archive'), i18n.t('properties.page.action_delete')]);
  });
});
