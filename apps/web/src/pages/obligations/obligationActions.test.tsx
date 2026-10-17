import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { grants, resetGrants } from '../../test/grants';
import { ObligationsPage } from './ObligationsPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/obligations', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listObligations: vi.fn(), toggleObligation: vi.fn() }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

import { listObligations, toggleObligation } from '../../api/obligations';

beforeEach(() => {
  vi.clearAllMocks();
  resetGrants('obligations:view');
  vi.mocked(listObligations).mockResolvedValue([{ id: 'o1', body: 'Labour', title: 'Monthly wage file', done: false }] as never);
  vi.mocked(toggleObligation).mockResolvedValue({} as never);
});

async function clickRow() {
  render(
    <MemoryRouter>
      <ObligationsPage />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByText('Monthly wage file'));
}

/** Marking an obligation done reviews it; without that the row does not toggle. */
describe('An obligation row toggles only with review', () => {
  it('a view only employee clicks the row and nothing is sent', async () => {
    await clickRow();
    expect(toggleObligation).not.toHaveBeenCalled();
  });

  it('review toggles it', async () => {
    grants.add('obligations:review');
    await clickRow();
    await vi.waitFor(() => expect(toggleObligation).toHaveBeenCalledWith('o1'));
    await screen.findByText('Monthly wage file');
  });
});
