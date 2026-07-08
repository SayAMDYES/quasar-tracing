/**
 * i18next initialization. Exposes the configured singleton (also used by
 * non-component modules like charts/options.js). Side effects on language change:
 * persist the choice, set <html lang>, and switch the dayjs locale so relative
 * times ("12s ago" / "12 秒前") localize too.
 *
 * @author Quasar
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import en from './locales/en';
import zhCN from './locales/zh-CN';

export const SUPPORTED_LANGUAGES = [
  { key: 'en', label: 'EN' },
  { key: 'zh-CN', label: '中文' },
];

const STORAGE_KEY = 'quasar.lang';

/** Normalize any locale string to one of the supported keys. */
export function normalizeLang(lng) {
  return (lng || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

function detectInitialLang() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return normalizeLang(saved);
  return normalizeLang(navigator.language || 'en');
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
  },
  lng: detectInitialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

function applySideEffects(lng) {
  const normalized = normalizeLang(lng);
  document.documentElement.lang = normalized === 'zh-CN' ? 'zh-CN' : 'en';
  dayjs.locale(normalized === 'zh-CN' ? 'zh-cn' : 'en');
}

applySideEffects(i18n.language);
i18n.on('languageChanged', (lng) => {
  localStorage.setItem(STORAGE_KEY, normalizeLang(lng));
  applySideEffects(lng);
});

export default i18n;
