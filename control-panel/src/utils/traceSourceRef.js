/**
 * Stable source references used by Trace Compare URLs.
 *
 * @author Quasar
 */

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;

export function liveTraceRef(traceId) {
  const normalized = String(traceId || '').toLowerCase();
  return TRACE_ID_PATTERN.test(normalized) ? `live:${normalized}` : null;
}

export function archiveTraceRef(traceId) {
  const normalized = String(traceId || '').toLowerCase();
  return TRACE_ID_PATTERN.test(normalized) ? `archive:${normalized}` : null;
}

export function parseTraceSourceRef(value) {
  if (typeof value !== 'string') return null;
  const separator = value.indexOf(':');
  if (separator <= 0) return null;
  const source = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if ((source === 'live' || source === 'archive') && TRACE_ID_PATTERN.test(id)) {
    return { source, traceId: id, ref: value };
  }
  return null;
}

export function traceRefPath(value) {
  const parsed = parseTraceSourceRef(value);
  if (!parsed) return null;
  return `/traces/${parsed.traceId}${parsed.source === 'archive' ? '?source=archive' : ''}`;
}

export function traceComparePath(baseline, candidate) {
  if (!parseTraceSourceRef(baseline) || !parseTraceSourceRef(candidate)) return null;
  return `/traces/compare?${new URLSearchParams({ a: baseline, b: candidate })}`;
}
