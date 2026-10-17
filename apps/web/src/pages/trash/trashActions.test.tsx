import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton } from '../../test/rowMenu';
import { TrashPage } from './TrashPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/trash', () => ({ listTrash: vi.fn(), purgeFromTrash: vi.fn(), restoreFromTrash: vi.fn() }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

import { listTrash } from '../../api/trash';

beforeEach(() => {
  resetGrants('audit:view');
  vi.mocked(listTrash).mockResolvedValue({
    retentionDays: 30,
    groups: [{ entity: 'customers', label: 'Customers', items: [{ id: 'c1', name: 'Gone', deletedAt: '2026-06-01', daysLeft: 20, retainedUntil: null, retainedBy: [] }] }],
  } as never);
});

/** The bin lives on the audit screen: restoring reviews, purging deletes. */
describe('Trash controls follow the actions', () => {
  it('a view only employee gets no restore and no purge', async () => {
    render(<TrashPage />);
    await screen.findByText('Gone');
    expect(hasButton(i18n.t('trash.restore'))).toBe(false);
    expect(hasButton(i18n.t('trash.purge'))).toBe(false);
  });

  it('review restores and delete purges', async () => {
    grants.add('audit:review').add('audit:delete');
    render(<TrashPage />);
    await screen.findByText('Gone');
    expect(hasButton(i18n.t('trash.restore'))).toBe(true);
    expect(hasButton(i18n.t('trash.purge'))).toBe(true);
  });
});
