import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Property } from '../../api/properties';
import { setLanguage } from '../../i18n';
import { UnitModal } from './UnitModal';
import { storedUnitType, unitTypeLabel } from './unitTypes';

// File budget: one small form render and pure lookups, well under the default.
vi.setConfig({ testTimeout: 5_000 });

const RESIDENTIAL = 'سكني'; // i18n-exempt: the stored value under test
const properties = [{ id: 'p1', name: 'Tower' }] as unknown as Property[];

describe('unit types: stored once, shown in the user language', () => {
  afterEach(() => setLanguage('ar'));

  it('labels a stored type in each language and keeps free text as stored', () => {
    setLanguage('ar');
    expect(unitTypeLabel(RESIDENTIAL)).toBe(RESIDENTIAL);
    setLanguage('en');
    expect(unitTypeLabel(RESIDENTIAL)).toBe('Residential');
    expect(unitTypeLabel('Penthouse')).toBe('Penthouse');
  });

  it('stores the fixed value for a label in either language, and free text as typed', () => {
    setLanguage('en');
    expect(storedUnitType('Residential')).toBe(RESIDENTIAL);
    expect(storedUnitType(RESIDENTIAL)).toBe(RESIDENTIAL);
    expect(storedUnitType('Penthouse')).toBe('Penthouse');
  });

  it('English form: shows the label and saves the fixed value', async () => {
    setLanguage('en');
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<UnitModal properties={properties} editing={null} onCancel={() => {}} onSave={onSave} />);
    expect(screen.getByDisplayValue('Residential')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('B-12'), { target: { value: 'A-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add unit' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].type).toBe(RESIDENTIAL);
  });
});
