/**
 * Runtime light/dark tokens and chart theme projection.
 *
 * @author Quasar
 */

const fontValues = {
  sans: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
};

function createSemanticTokens(mode, brandValues, neutralValues, statusValues, palette, percentile) {
  const severity = {
    TRACE: { color: neutralValues.textMuted, bg: statusValues.neutralBg, label: 'TRACE' },
    DEBUG: { color: neutralValues.textSecondary, bg: neutralValues.surfaceMuted, label: 'DEBUG' },
    INFO: { color: statusValues.info, bg: statusValues.infoBg, label: 'INFO' },
    WARN: { color: statusValues.warn, bg: statusValues.warnBg, label: 'WARN' },
    ERROR: { color: statusValues.error, bg: statusValues.errorBg, label: 'ERROR' },
    FATAL: { color: mode === 'dark' ? '#FF8F94' : '#A21118', bg: statusValues.errorBg, label: 'FATAL' },
  };
  return Object.freeze({
    mode,
    brand: Object.freeze(brandValues),
    neutral: Object.freeze(neutralValues),
    status: Object.freeze(statusValues),
    severityMeta: Object.freeze(severity),
    spanStatusMeta: Object.freeze({
      Ok: { color: statusValues.ok, bg: statusValues.okBg, label: 'OK' },
      Unset: { color: statusValues.neutral, bg: statusValues.neutralBg, label: 'UNSET' },
      Error: { color: statusValues.error, bg: statusValues.errorBg, label: 'ERROR' },
    }),
    spanKindMeta: Object.freeze({
      Server: { color: palette[1], label: 'SERVER' },
      Client: { color: palette[3], label: 'CLIENT' },
      Producer: { color: palette[9], label: 'PRODUCER' },
      Consumer: { color: palette[5], label: 'CONSUMER' },
      Internal: { color: statusValues.neutral, label: 'INTERNAL' },
    }),
    chartPalette: Object.freeze(palette),
    percentileColors: Object.freeze(percentile),
    fonts: Object.freeze(fontValues),
  });
}

export const lightTokens = createSemanticTokens(
  'light',
  {
    primary: '#F26A1B', primaryHover: '#FF8A47', primaryActive: '#D2540E',
    strong: '#C2540F', tint: '#FFF4EC', tintStrong: '#FFE3CC', glow: 'rgba(242, 106, 27, 0.16)',
  },
  {
    canvas: '#F6F7F9', surface: '#FFFFFF', surfaceMuted: '#FAFAFB', border: '#ECEEF1',
    borderStrong: '#DCDFE5', heading: '#11151B', text: '#1B1F26', textSecondary: '#5B6573',
    textMuted: '#8A92A0', textDisabled: '#B6BCC6',
  },
  {
    ok: '#1F9D55', okBg: '#E7F6ED', error: '#E5484D', errorBg: '#FCEBEC',
    warn: '#E0920A', warnBg: '#FCF2DC', info: '#2E7DD1', infoBg: '#E8F1FB',
    neutral: '#7A828F', neutralBg: '#F0F2F5',
  },
  ['#F26A1B', '#2E7DD1', '#1F9D55', '#8B5CF6', '#E5484D', '#14B8A6', '#E0920A', '#64748B', '#D9488F', '#0E7490'],
  { p50: '#F6A85C', p90: '#F26A1B', p99: '#C2540F' },
);

export const darkTokens = createSemanticTokens(
  'dark',
  {
    primary: '#FF8A47', primaryHover: '#FFA66F', primaryActive: '#F26A1B',
    strong: '#FFAD7A', tint: 'rgba(242, 106, 27, 0.14)', tintStrong: 'rgba(242, 106, 27, 0.24)',
    glow: 'rgba(255, 138, 71, 0.28)',
  },
  {
    canvas: '#111318', surface: '#191C22', surfaceMuted: '#20242B', border: '#303640',
    borderStrong: '#454D59', heading: '#F4F6F8', text: '#E6E9EE', textSecondary: '#B5BDC9',
    textMuted: '#929CAB', textDisabled: '#687280',
  },
  {
    ok: '#57D187', okBg: 'rgba(87, 209, 135, 0.14)', error: '#FF7479', errorBg: 'rgba(255, 116, 121, 0.14)',
    warn: '#F1B955', warnBg: 'rgba(241, 185, 85, 0.14)', info: '#72AFE9', infoBg: 'rgba(114, 175, 233, 0.14)',
    neutral: '#AAB2BF', neutralBg: '#292E36',
  },
  ['#FF8A47', '#72AFE9', '#57D187', '#A78BFA', '#FF7479', '#2DD4BF', '#F1B955', '#94A3B8', '#F472B6', '#22B8CF'],
  { p50: '#F5B66D', p90: '#FF8A47', p99: '#FFAD7A' },
);

export function getThemeTokens(mode) {
  return mode === 'dark' ? darkTokens : lightTokens;
}

export function createChartTheme(tokens) {
  const { brand: brandValues, neutral: neutralValues, status: statusValues } = tokens;
  return Object.freeze({
    mode: tokens.mode,
    background: neutralValues.surface,
    axis: neutralValues.textMuted,
    split: tokens.mode === 'dark' ? '#343A44' : '#EEF0F3',
    text: neutralValues.text,
    textSecondary: neutralValues.textSecondary,
    tooltipBackground: neutralValues.surface,
    tooltipBorder: neutralValues.borderStrong,
    tooltipShadow: tokens.mode === 'dark'
      ? 'box-shadow: 0 10px 28px rgba(0,0,0,0.38); border-radius: 8px;'
      : 'box-shadow: 0 6px 16px rgba(16,24,40,0.10); border-radius: 8px;',
    loadingMask: tokens.mode === 'dark' ? 'rgba(17,19,24,0.72)' : 'rgba(255,255,255,0.60)',
    brand: brandValues.primary,
    brandActive: brandValues.primaryActive,
    brandGlow: brandValues.glow,
    brandAreaStart: tokens.mode === 'dark' ? 'rgba(255,138,71,0.30)' : 'rgba(242,106,27,0.26)',
    brandAreaEnd: tokens.mode === 'dark' ? 'rgba(255,138,71,0.03)' : 'rgba(242,106,27,0.02)',
    error: statusValues.error,
    errorAreaStart: tokens.mode === 'dark' ? 'rgba(255,116,121,0.26)' : 'rgba(229,72,77,0.22)',
    errorAreaEnd: tokens.mode === 'dark' ? 'rgba(255,116,121,0.03)' : 'rgba(229,72,77,0.02)',
    ok: statusValues.ok,
    warn: statusValues.warn,
    edge: tokens.mode === 'dark' ? '#606A78' : '#C7CCD4',
    heatmapBorder: neutralValues.surface,
    palette: tokens.chartPalette,
    percentile: tokens.percentileColors,
    severity: tokens.severityMeta,
  });
}

export const fonts = lightTokens.fonts;
export const brand = Object.freeze({
  primary: 'var(--brand-primary)', primaryHover: 'var(--brand-hover)',
  primaryActive: 'var(--brand-active)', strong: 'var(--brand-strong)',
  tint: 'var(--brand-tint)', tintStrong: 'var(--brand-tint-strong)', glow: 'var(--brand-glow)',
});
export const neutral = Object.freeze({
  canvas: 'var(--canvas)', surface: 'var(--surface)', surfaceMuted: 'var(--surface-muted)',
  border: 'var(--border)', borderStrong: 'var(--border-strong)', heading: 'var(--heading)',
  text: 'var(--text)', textSecondary: 'var(--text-secondary)', textMuted: 'var(--text-muted)',
  textDisabled: 'var(--text-disabled)',
});
export const status = Object.freeze({
  ok: 'var(--ok)', okBg: 'var(--ok-bg)', error: 'var(--error)', errorBg: 'var(--error-bg)',
  warn: 'var(--warn)', warnBg: 'var(--warn-bg)', info: 'var(--info)', infoBg: 'var(--info-bg)',
  neutral: 'var(--status-neutral)', neutralBg: 'var(--status-neutral-bg)',
});
export const severityMeta = Object.freeze({
  TRACE: { color: neutral.textMuted, bg: status.neutralBg, label: 'TRACE' },
  DEBUG: { color: neutral.textSecondary, bg: neutral.surfaceMuted, label: 'DEBUG' },
  INFO: { color: status.info, bg: status.infoBg, label: 'INFO' },
  WARN: { color: status.warn, bg: status.warnBg, label: 'WARN' },
  ERROR: { color: status.error, bg: status.errorBg, label: 'ERROR' },
  FATAL: { color: status.error, bg: status.errorBg, label: 'FATAL' },
});
export const spanStatusMeta = Object.freeze({
  Ok: { color: status.ok, bg: status.okBg, label: 'OK' },
  Unset: { color: status.neutral, bg: status.neutralBg, label: 'UNSET' },
  Error: { color: status.error, bg: status.errorBg, label: 'ERROR' },
});
export const chartPalette = Object.freeze(Array.from({ length: 10 }, (_, index) => `var(--chart-${index + 1})`));
export const spanKindMeta = Object.freeze({
  Server: { color: chartPalette[1], label: 'SERVER' },
  Client: { color: chartPalette[3], label: 'CLIENT' },
  Producer: { color: chartPalette[9], label: 'PRODUCER' },
  Consumer: { color: chartPalette[5], label: 'CONSUMER' },
  Internal: { color: status.neutral, label: 'INTERNAL' },
});
export const percentileColors = Object.freeze({
  p50: 'var(--percentile-p50)', p90: 'var(--brand-primary)', p99: 'var(--brand-strong)',
});
