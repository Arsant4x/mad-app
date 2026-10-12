import i18n from '../i18n';

/**
 * Label tables that translate when read, not when the module loads, so a label
 * follows the language the user picks later. Each property becomes an
 * enumerable getter: `table[key]`, `Object.keys`, `Object.entries` and spreading
 * all keep working and return text in the current language.
 */

const written = new WeakMap<object, Map<PropertyKey, unknown>>();

/** Makes one field read `key` from the translation files each time it is read. */
export function translateField<T extends object>(obj: T, field: keyof T, key: string, values?: () => Record<string, unknown>): T {
  const fields = written.get(obj) ?? new Map<PropertyKey, unknown>();
  fields.set(field, (obj as Record<PropertyKey, unknown>)[field as PropertyKey]);
  written.set(obj, fields);
  Object.defineProperty(obj, field, { enumerable: true, configurable: true, get: () => i18n.t(key, values?.()) });
  return obj;
}

/**
 * Turns every value of a written table into a getter reading `<prefix>.<key>`.
 * Used where a server check compares the Arabic text written in the source with
 * its own list, so the Arabic must stay in the file.
 */
export function translateTable<T extends Record<string, string>>(table: T, prefix: string): T {
  for (const k of Object.keys(table)) translateField(table, k, `${prefix}.${k.toLowerCase()}`);
  return table;
}

/** A table built from its keys alone: each value is `<prefix>.<key>` translated when read. */
export function labelTable<K extends string>(prefix: string, keys: readonly K[]): Record<K, string> {
  const table = {} as Record<K, string>;
  for (const k of keys) Object.defineProperty(table, k, { enumerable: true, get: () => i18n.t(`${prefix}.${k.toLowerCase()}`) });
  return table;
}

/** The value a field held in the source before it was made to translate. */
export function writtenValue(obj: object, field: PropertyKey): unknown {
  return written.get(obj)?.get(field);
}
