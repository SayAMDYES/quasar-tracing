/**
 * Stable theme preference storage helpers shared by bootstrap and React.
 *
 * @author Quasar
 */

export const THEME_STORAGE_KEY = 'quasar.theme.mode';
export const THEME_PREFERENCES = Object.freeze(['system', 'light', 'dark']);

export function isThemePreference(value) {
  return THEME_PREFERENCES.includes(value);
}

export function readThemePreference(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    const value = target?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemePreference(preference, storage) {
  if (!isThemePreference(preference)) return false;
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    target?.setItem(THEME_STORAGE_KEY, preference);
    return Boolean(target);
  } catch {
    return false;
  }
}

export function resolveEffectiveTheme(preference, systemDark) {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return systemDark ? 'dark' : 'light';
}

export function subscribeToSystemTheme(preference, mediaQuery, listener) {
  if (preference !== 'system' || !mediaQuery?.addEventListener) return () => {};
  const handleChange = (event) => listener(Boolean(event.matches));
  mediaQuery.addEventListener('change', handleChange);
  return () => mediaQuery.removeEventListener('change', handleChange);
}
