/**
 * Design tokens — the single source of truth for colors, fonts and chart palettes.
 *
 * Values are mirrored as CSS variables in src/styles/global.css so they can be
 * consumed from plain CSS too. Keep the two in sync when editing.
 *
 * @author Quasar
 */

// Brand — white canvas with orange as the primary identity color.
export const brand = {
  primary: '#F26A1B',
  primaryHover: '#FF8A47',
  primaryActive: '#D2540E',
  strong: '#C2540F', // orange-on-white that must meet AA text contrast
  tint: '#FFF4EC', // subtle fills, selected rows, active nav
  tintStrong: '#FFE3CC',
  glow: 'rgba(242, 106, 27, 0.16)',
};

// Neutrals — Swiss/minimal greys with a faintly warm near-black.
export const neutral = {
  canvas: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceMuted: '#FAFAFB',
  border: '#ECEEF1',
  borderStrong: '#DCDFE5',
  heading: '#11151B',
  text: '#1B1F26',
  textSecondary: '#5B6573',
  textMuted: '#8A92A0',
  textDisabled: '#B6BCC6',
};

// Semantic status colors — kept visually distinct from brand orange.
export const status = {
  ok: '#1F9D55',
  okBg: '#E7F6ED',
  error: '#E5484D',
  errorBg: '#FCEBEC',
  warn: '#E0920A',
  warnBg: '#FCF2DC',
  info: '#2E7DD1',
  infoBg: '#E8F1FB',
  neutral: '#7A828F',
  neutralBg: '#F0F2F5',
};

// Log severities (OpenTelemetry SeverityText values).
export const severityMeta = {
  TRACE: { color: '#9AA1AC', bg: '#F2F3F5', label: 'TRACE' },
  DEBUG: { color: '#6B7280', bg: '#EEF0F3', label: 'DEBUG' },
  INFO: { color: status.info, bg: status.infoBg, label: 'INFO' },
  WARN: { color: status.warn, bg: status.warnBg, label: 'WARN' },
  ERROR: { color: status.error, bg: status.errorBg, label: 'ERROR' },
  FATAL: { color: '#A21118', bg: '#FBE3E4', label: 'FATAL' },
};

// Span status (OpenTelemetry StatusCode values).
export const spanStatusMeta = {
  Ok: { color: status.ok, bg: status.okBg, label: 'OK' },
  Unset: { color: status.neutral, bg: status.neutralBg, label: 'UNSET' },
  Error: { color: status.error, bg: status.errorBg, label: 'ERROR' },
};

// Span kinds (OpenTelemetry SpanKind values).
export const spanKindMeta = {
  Server: { color: '#2E7DD1', label: 'SERVER' },
  Client: { color: '#8B5CF6', label: 'CLIENT' },
  Producer: { color: '#0E7490', label: 'PRODUCER' },
  Consumer: { color: '#14B8A6', label: 'CONSUMER' },
  Internal: { color: '#7A828F', label: 'INTERNAL' },
};

// Categorical palette for charts and service coloring — brand first, then
// accessible distinct hues. Used by serviceColor() in utils/colors.js.
export const chartPalette = [
  '#F26A1B',
  '#2E7DD1',
  '#1F9D55',
  '#8B5CF6',
  '#E5484D',
  '#14B8A6',
  '#E0920A',
  '#64748B',
  '#D9488F',
  '#0E7490',
];

// Latency percentile shades — orange family, light (p50) to dark (p99).
export const percentileColors = {
  p50: '#F6A85C',
  p90: '#F26A1B',
  p99: '#C2540F',
};

export const fonts = {
  sans: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
};
