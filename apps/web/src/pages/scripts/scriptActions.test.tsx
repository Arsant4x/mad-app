import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton, rowMenuLabels } from '../../test/rowMenu';
import { ScriptsPage } from './ScriptsPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/scripts', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listScripts: vi.fn() }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

import { listScripts } from '../../api/scripts';

beforeEach(() => {
  resetGrants('scripts:view');
  vi.mocked(listScripts).mockResolvedValue([{ id: 's1', audience: 'TENANT', title: 'Reminder', text: 'Hello', archived: false }] as never);
});

describe('Scripts controls follow the actions', () => {
  it('a view only employee gets no new button and no row actions', async () => {
    render(<ScriptsPage />);
    await screen.findByText('Reminder');
    expect(hasButton(i18n.t('scripts.new_button'))).toBe(false);
    expect(rowMenuLabels()).toEqual([]);
  });

  it('each action shows its own control', async () => {
    grants.add('scripts:add').add('scripts:edit').add('scripts:delete');
    render(<ScriptsPage />);
    await screen.findByText('Reminder');
    expect(hasButton(i18n.t('scripts.new_button'))).toBe(true);
    expect(rowMenuLabels()).toEqual([i18n.t('scripts.menu.edit'), i18n.t('scripts.menu.archive'), i18n.t('scripts.menu.delete')]);
  });
});
