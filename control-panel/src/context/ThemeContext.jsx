/**
 * Single runtime source for persisted preference, effective mode and theme tokens.
 *
 * @author Quasar
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createChartTheme, getThemeTokens } from '@/theme/tokens';
import {
  isThemePreference,
  readThemePreference,
  resolveEffectiveTheme,
  subscribeToSystemTheme,
  writeThemePreference,
} from '@/theme/themeStorage';

const ThemeContext = createContext(null);

function systemMedia() {
  return typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)');
}

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(() => readThemePreference());
  const [systemDark, setSystemDark] = useState(() => Boolean(systemMedia()?.matches));

  useEffect(() => {
    const media = systemMedia();
    if (preference === 'system') setSystemDark(Boolean(media?.matches));
    return subscribeToSystemTheme(preference, media, setSystemDark);
  }, [preference]);

  const effectiveMode = resolveEffectiveTheme(preference, systemDark);
  const tokens = useMemo(() => getThemeTokens(effectiveMode), [effectiveMode]);
  const chartTheme = useMemo(() => createChartTheme(tokens), [tokens]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = effectiveMode;
    root.style.colorScheme = effectiveMode;
  }, [effectiveMode]);

  const setPreference = (next) => {
    if (!isThemePreference(next)) return;
    setPreferenceState(next);
    writeThemePreference(next);
  };

  const value = useMemo(() => ({
    preference,
    effectiveMode,
    setPreference,
    tokens,
    chartTheme,
  }), [preference, effectiveMode, tokens, chartTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useThemeMode must be used within ThemeProvider');
  return value;
}
