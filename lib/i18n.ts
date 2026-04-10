import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files
import en from '../locales/en.json';
import es from '../locales/es.json';
import ar from '../locales/ar.json';

const SUPPORTED_LANGS = ['en', 'es'] as const;

function resolveInitialLanguage() {
  const rawLocale = (Localization as any).locale ?? 'en';
  const baseLocale = String(rawLocale).toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGS.includes(baseLocale as (typeof SUPPORTED_LANGS)[number]) ? baseLocale : 'en';
}

const resources = {
  en: { translation: en },
  es: { translation: es },
  ar: { translation: ar },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: resolveInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    react: {
      useSuspense: false, // Disable suspense for simplicity
    },
  });

export default i18n;
