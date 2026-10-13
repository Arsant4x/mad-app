import i18n from '../../i18n';

// Suggested unit types are stored as one fixed value and shown in the user's
// language. Anything else the user types is free text and is kept as typed.
const STORED_UNIT_TYPES = [
  { value: 'سكني', key: 'residential' }, // i18n-exempt: stored unit type value
  { value: 'محل', key: 'shop' }, // i18n-exempt: stored unit type value
  { value: 'معرض', key: 'showroom' }, // i18n-exempt: stored unit type value
  { value: 'مكتب', key: 'office' }, // i18n-exempt: stored unit type value
  { value: 'مخزن', key: 'storeroom' }, // i18n-exempt: stored unit type value
  { value: 'أخرى', key: 'other' }, // i18n-exempt: stored unit type value
] as const;

export const DEFAULT_UNIT_TYPE: string = STORED_UNIT_TYPES[0].value;

/** Label of a stored unit type in the interface language; free text shows as stored. */
export function unitTypeLabel(stored: string): string {
  const known = STORED_UNIT_TYPES.find((u) => u.value === stored);
  return known ? i18n.t(`units.types.${known.key}`) : stored;
}

/** Labels of the suggested types, in the interface language, for the input's suggestions. */
export function unitTypeSuggestions(): string[] {
  return STORED_UNIT_TYPES.map((u) => unitTypeLabel(u.value));
}

/**
 * The value to store for what the user entered: a suggested type's label in
 * either language becomes its fixed value; free text is stored as typed.
 */
export function storedUnitType(input: string): string {
  const typed = input.trim();
  const known = STORED_UNIT_TYPES.find(
    (u) => u.value === typed || ['ar', 'en'].some((lng) => i18n.t(`units.types.${u.key}`, { lng }) === typed),
  );
  return known ? known.value : input;
}
