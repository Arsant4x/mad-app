import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import en from './locales/en.json';

const STORAGE_KEY = 'ui_language';
const storedLanguage = localStorage.getItem(STORAGE_KEY);

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: storedLanguage ?? 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: 'ar' | 'en') {
  i18n.changeLanguage(lang);
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

setLanguage((storedLanguage as 'ar' | 'en') ?? 'ar');

export default i18n;
