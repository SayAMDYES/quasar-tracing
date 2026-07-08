/**
 * App-wide UI state shared across pages: the active time range and environment.
 * The top bar writes it; Overview, Service Map and Metrics read it so the whole
 * dashboard moves together.
 *
 * @author Quasar
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export const QUICK_RANGES = [
  { key: '15m', label: 'Last 15m', ms: 15 * 60 * 1000 },
  { key: '1h', label: 'Last 1h', ms: 60 * 60 * 1000 },
  { key: '3h', label: 'Last 3h', ms: 3 * 60 * 60 * 1000 },
  { key: '6h', label: 'Last 6h', ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: 'Last 24h', ms: 24 * 60 * 60 * 1000 },
];

const DEFAULT_KEY = '24h';
export const CUSTOM_RANGE_KEY = 'custom';
const DEFAULT_AUTO_REFRESH = 'off';
const AUTO_REFRESH_STORAGE_KEY = 'quasar-tracing:auto-refresh';

export const AUTO_REFRESH_OPTIONS = [
  { key: 'off', ms: 0 },
  { key: '5s', ms: 5 * 1000 },
  { key: '10s', ms: 10 * 1000 },
  { key: '30s', ms: 30 * 1000 },
  { key: '1m', ms: 60 * 1000 },
  { key: '5m', ms: 5 * 60 * 1000 },
  { key: '15m', ms: 15 * 60 * 1000 },
];

function resolveAutoRefreshKey(key) {
  return AUTO_REFRESH_OPTIONS.some((option) => option.key === key) ? key : DEFAULT_AUTO_REFRESH;
}

function loadAutoRefreshKey() {
  if (typeof window === 'undefined') return DEFAULT_AUTO_REFRESH;
  return resolveAutoRefreshKey(window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY));
}

function isValidCustomRange(customRange) {
  return customRange && Number.isFinite(customRange.from) && Number.isFinite(customRange.to) && customRange.from < customRange.to;
}

function resolveRange(key, customRange) {
  if (key === CUSTOM_RANGE_KEY && isValidCustomRange(customRange)) {
    return { key: CUSTOM_RANGE_KEY, label: 'Custom', from: customRange.from, to: customRange.to };
  }
  const preset = QUICK_RANGES.find((r) => r.key === key) || QUICK_RANGES[4];
  const to = Date.now();
  return { key: preset.key, label: preset.label, from: to - preset.ms, to };
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [rangeKey, setRangeKey] = useState(DEFAULT_KEY);
  const [customRange, setCustomRangeState] = useState(null);
  const [environment, setEnvironment] = useState('all');
  const [range, setRange] = useState(() => resolveRange(DEFAULT_KEY, null));
  const [autoRefreshKey, setAutoRefreshKeyState] = useState(loadAutoRefreshKey);
  const [autoRefreshRevision, setAutoRefreshRevision] = useState(0);

  const refreshRange = () => setRange(resolveRange(rangeKey, customRange));

  const applyRangeKey = (key) => {
    const nextRange = resolveRange(key, customRange);
    setRangeKey(nextRange.key);
    setRange(nextRange);
  };

  const setCustomRange = (from, to) => {
    const nextCustomRange = { from, to };
    if (!isValidCustomRange(nextCustomRange)) return;
    setCustomRangeState(nextCustomRange);
    setRangeKey(CUSTOM_RANGE_KEY);
    setRange(resolveRange(CUSTOM_RANGE_KEY, nextCustomRange));
  };

  const setAutoRefreshKey = (key) => {
    const nextKey = resolveAutoRefreshKey(key);
    setAutoRefreshKeyState(nextKey);
    window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, nextKey);
  };

  useEffect(() => {
    const intervalMs = AUTO_REFRESH_OPTIONS.find((option) => option.key === autoRefreshKey)?.ms || 0;
    if (!intervalMs) return undefined;

    const timer = window.setInterval(() => {
      setAutoRefreshRevision((revision) => revision + 1);
      setRange(resolveRange(rangeKey, customRange));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [autoRefreshKey, rangeKey, customRange]);

  const value = useMemo(
    () => ({
      range,
      rangeKey,
      customRange,
      autoRefreshKey,
      autoRefreshRevision,
      environment,
      setEnvironment,
      setAutoRefreshKey,
      setCustomRange,
      // Re-resolves "now" on every change so the range stays fresh.
      setRangeKey: applyRangeKey,
      refreshRange,
    }),
    [range, rangeKey, customRange, autoRefreshKey, autoRefreshRevision, environment],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
