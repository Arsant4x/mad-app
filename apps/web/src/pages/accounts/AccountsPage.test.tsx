import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton, rowMenuLabels } from '../../test/rowMenu';
import { AccountsPage } from './AccountsPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/accounts', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listAccounts: vi.fn(),
  getAccountsSummary: vi.fn(),
}));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

import { getAccountsSummary, listAccounts } from '../../api/accounts';

beforeEach(() => {
  resetGrants('accounts:view');
  vi.mocked(listAccounts).mockResolvedValue([{ id: 'a1', code: '1000', name: 'Cash', type: 'asset', openingDate: null } as never]);
  vi.mocked(getAccountsSummary).mockResolvedValue(null as never);
});

async function shown() {
  render(<AccountsPage />);
  await screen.findByText('Cash');
}

/** The new button needs add, edit needs edit, delete needs delete; the server refuses them otherwise. */
describe('Accounts controls follow the actions', () => {
  it('a view only employee gets no new button and no row actions', async () => {
    await shown();
    expect(hasButton(i18n.t('accounts.list.new'))).toBe(false);
    expect(rowMenuLabels()).toEqual([]);
  });

  it('each action shows its own control', async () => {
    grants.add('accounts:add').add('accounts:edit').add('accounts:delete');
    await shown();
    expect(hasButton(i18n.t('accounts.list.new'))).toBe(true);
    expect(rowMenuLabels()).toEqual([i18n.t('accounts.list.edit'), i18n.t('accounts.list.delete')]);
  });
});
