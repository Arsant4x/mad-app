import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton, rowMenuLabels } from '../../test/rowMenu';
import { JournalPage } from './JournalPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/journal', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listJournalEntries: vi.fn() }));
vi.mock('../../api/accounts', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listAccounts: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

import { listJournalEntries } from '../../api/journal';

beforeEach(() => {
  resetGrants('journal:view');
  vi.mocked(listJournalEntries).mockResolvedValue({
    items: [{ id: 'j1', no: 'JE-1', date: '2026-06-01', memo: 'Manual', totalDebit: '10.00', totalCredit: '10.00', auto: false, reversedBy: null, reversalOf: null }],
    total: 1,
    page: 1,
    pageSize: 25,
  } as never);
});

/** A manual entry and its reversal both need record on the journal. */
describe('Journal controls follow record', () => {
  it('a view only employee gets no new entry and no reversal', async () => {
    render(<JournalPage />);
    await screen.findByText('JE-1');
    expect(hasButton(i18n.t('journal.list.new'))).toBe(false);
    expect(rowMenuLabels()).toEqual([]);
  });

  it('record shows both', async () => {
    grants.add('journal:record');
    render(<JournalPage />);
    await screen.findByText('JE-1');
    expect(hasButton(i18n.t('journal.list.new'))).toBe(true);
    expect(rowMenuLabels()).toEqual([i18n.t('journal.list.reverse_action')]);
  });
});
