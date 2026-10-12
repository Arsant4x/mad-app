import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import en from './locales/en.json';

export type Language = 'ar' | 'en';
type Dict = Record<string, unknown>;

const STORAGE_KEY = 'ui_language';

/**
 * Each screen area keeps its strings in locales/<lang>/<area>.json, so two
 * changes to different areas never touch the same file. The file name is the
 * key prefix: locales/ar/shell.json holds the keys read as t('shell.…').
 */
function areas(files: Record<string, Dict>): Dict {
  const out: Dict = {};
  for (const [path, dict] of Object.entries(files)) out[path.replace(/^.*\/([^/]+)\.json$/, '$1')] = dict;
  return out;
}

const arAreas = areas(import.meta.glob<Dict>('./locales/ar/*.json', { eager: true, import: 'default' }));
const enAreas = areas(import.meta.glob<Dict>('./locales/en/*.json', { eager: true, import: 'default' }));

/** The stored choice, or null when there is none or storage is blocked. */
function storedLanguage(): Language | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'ar' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: { ...ar, ...arAreas } },
    en: { translation: { ...en, ...enAreas } },
  },
  lng: storedLanguage() ?? 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

/** Switches the interface language, remembers the choice, and sets the page direction. */
export function setLanguage(lang: Language) {
  i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // The choice still applies to this page; it is just not remembered.
  }
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

/** The language the interface shows now. */
export const currentLanguage = (): Language => (i18n.language === 'en' ? 'en' : 'ar');

setLanguage(storedLanguage() ?? 'ar');

export default i18n;
