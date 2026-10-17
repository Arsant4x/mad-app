import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { RowMenu, visibleEntries } from './RowMenu';

// File budget: pure function and two renders, well under the default.
vi.setConfig({ testTimeout: 5_000 });

const a = { label: 'a', onClick: () => {} };
const b = { label: 'b', onClick: () => {} };

describe('Row menu entries the actor may not run', () => {
  it('drops skipped entries and the separators left at an edge or doubled', () => {
    expect(visibleEntries([false, a, '-', null, '-', b, undefined])).toEqual([a, '-', b]);
    expect(visibleEntries(['-', a, '-', false])).toEqual([a]);
    expect(visibleEntries([a, '-', b])).toEqual([a, '-', b]);
  });

  it('renders no menu button when no entry is left', () => {
    render(<RowMenu actions={[false, '-', null]} />);
    expect(screen.queryByTitle(i18n.t('common.row_menu.options'))).toBeNull();
  });

  it('renders the menu button when an entry is left', () => {
    render(<RowMenu actions={[false, '-', a]} />);
    expect(screen.getByTitle(i18n.t('common.row_menu.options'))).toBeTruthy();
  });
});
