import { describe, expect, it, vi } from 'vitest';
import ar from './locales/ar.json';
import en from './locales/en.json';

// File budget: pure reads of the translation files, well under the default.
vi.setConfig({ testTimeout: 5_000 });

type Dict = { [k: string]: string | Dict };

function flat(dict: Dict, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(dict)) {
    if (typeof v === 'string') out.set(prefix + k, v);
    else for (const [kk, vv] of flat(v, `${prefix}${k}.`)) out.set(kk, vv);
  }
  return out;
}

function load(lang: 'ar' | 'en', root: Dict): Map<string, string> {
  const files = lang === 'ar'
    ? import.meta.glob<Dict>('./locales/ar/*.json', { eager: true, import: 'default' })
    : import.meta.glob<Dict>('./locales/en/*.json', { eager: true, import: 'default' });
  const all: Dict = { ...root };
  for (const [path, dict] of Object.entries(files)) all[path.replace(/^.*\/([^/]+)\.json$/, '$1')] = dict;
  return flat(all);
}

const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

describe('translation files', () => {
  const arKeys = load('ar', ar as Dict);
  const enKeys = load('en', en as Dict);

  it('read every area file', () => {
    expect(arKeys.has('shell.menu')).toBe(true);
    expect(enKeys.has('shell.menu')).toBe(true);
  });

  it('have the same keys in Arabic and English', () => {
    expect([...arKeys.keys()].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys.keys()].filter((k) => !arKeys.has(k))).toEqual([]);
  });

  it('have no empty text', () => {
    expect([...arKeys].filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
    expect([...enKeys].filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });

  it('use the same placeholders in both languages', () => {
    const differ = [...arKeys]
      .filter(([k, v]) => enKeys.has(k) && placeholders(v).join() !== placeholders(enKeys.get(k)!).join())
      .map(([k]) => k);
    expect(differ).toEqual([]);
  });

  it('keep Arabic letters out of English text', () => {
    // The language switch label is the one English entry written in Arabic on purpose.
    const arabic = [...enKeys].filter(([k, v]) => k !== 'language_toggle' && /[؀-ۿ]/.test(v)).map(([k]) => k);
    expect(arabic).toEqual([]);
  });
});
