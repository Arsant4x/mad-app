import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton } from '../../test/rowMenu';
import { FiscalPage } from './FiscalPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/fiscal', async (orig) => ({ ...(await orig<Record<string, unknown>>()), getFiscalYears: vi.fn() }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());
vi.mock('../../auth/AuthContext', async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...(await import('../../test/grants')).authModule() }));

import { getFiscalYears } from '../../api/fiscal';

beforeEach(() => {
  resetGrants('fiscal:view');
  vi.mocked(getFiscalYears).mockResolvedValue([
    {
      id: 'y1',
      name: 'FY 2026',
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-12-31T00:00:00.000Z',
      periods: [{ id: 'm1', month: 1, year: 2026, status: 'OPEN', closedAt: null, reopenReason: null }],
    },
  ] as never);
});

/** A year is added and deleted by those actions; closing and reopening a period reviews. */
describe('Fiscal controls follow the actions', () => {
  it('a view only employee gets no new year, delete or period close', async () => {
    render(<FiscalPage />);
    await screen.findByText('FY 2026');
    expect(hasButton(i18n.t('fiscal.new_year'))).toBe(false);
    expect(hasButton(i18n.t('fiscal.delete_year'))).toBe(false);
    expect(hasButton(i18n.t('fiscal.close'))).toBe(false);
  });

  it('each action shows its own control', async () => {
    grants.add('fiscal:add').add('fiscal:delete').add('fiscal:review');
    render(<FiscalPage />);
    await screen.findByText('FY 2026');
    expect(hasButton(i18n.t('fiscal.new_year'))).toBe(true);
    expect(hasButton(i18n.t('fiscal.delete_year'))).toBe(true);
    expect(hasButton(i18n.t('fiscal.close'))).toBe(true);
  });
});
