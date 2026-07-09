/**
 * API surface consumed by pages and hooks. Thin wrappers over the Axios client
 * that unwrap the platform's QTResponse envelope ({ code, message, data }) and
 * normalize payloads for the UI: Long fields the backend serializes as JSON
 * strings are restored to numbers, and QTPageDTO payloads are flattened to the
 * { total, items } shape the pages render. Endpoint paths live only here.
 *
 * @author Quasar
 */
import client from './client';

// Long fields serialized as JSON strings (@JsonFormat STRING) to avoid precision loss.
const NUMERIC_STRING_KEYS = new Set([
  'total', 'time', 'step', 'timestamp', 'startTime', 'durationNs',
  'calls', 'callCount', 'errorCount', 'requestCount',
]);

// OTel attribute maps carry arbitrary user keys — keep their string values verbatim.
const VERBATIM_KEYS = new Set(['resourceAttributes', 'spanAttributes', 'attributes']);

function revive(value) {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (VERBATIM_KEYS.has(key)) out[key] = v;
      else if (NUMERIC_STRING_KEYS.has(key) && typeof v === 'string' && v !== '') out[key] = Number(v);
      else out[key] = revive(v);
    }
    return out;
  }
  return value;
}

const unwrap = (p) =>
  p.then((r) => {
    const { code, message, data } = r.data || {};
    if (code !== 200) {
      throw Object.assign(new Error(message || 'Request failed, please try again.'), { code });
    }
    return revive(data);
  });

// QTPageDTO { current, size, total, records } → the { total, items } shape pages render.
const flattenPage = (page) => ({ total: page.total, items: page.records || [] });

export const fetchOverview = (params) => unwrap(client.get('/api/overview', { params }));

export const searchTraces = (params) =>
  unwrap(client.get('/api/traces', { params })).then(flattenPage);
export const fetchTrace = (traceId) => unwrap(client.get(`/api/traces/${traceId}`));
export const fetchTraceLogs = (traceId) => unwrap(client.get(`/api/traces/${traceId}/logs`));

// The backend takes severities as one CSV param; join the multi-select array.
export const searchLogs = ({ severities, ...params } = {}) =>
  unwrap(
    client.get('/api/logs', {
      params: { ...params, severities: severities?.length ? severities.join(',') : undefined },
    }),
  ).then((d) => ({ ...flattenPage(d.page), histogram: d.histogram }));

export function buildLogStreamUrl({ severities, ...params } = {}) {
  const query = new URLSearchParams();
  Object.entries({
    ...params,
    severities: severities?.length ? severities.join(',') : undefined,
  }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  const qs = query.toString();
  return qs ? `/api/logs/stream?${qs}` : '/api/logs/stream';
}

export const fetchServices = (params) => unwrap(client.get('/api/services', { params }));
export const fetchDependencies = (params) =>
  unwrap(client.get('/api/services/dependencies', { params }));
export const fetchServiceDetail = (name, params) =>
  unwrap(client.get(`/api/services/${name}`, { params }));

export const fetchMetrics = (params) => unwrap(client.get('/api/metrics', { params }));

export const fetchFilters = () => unwrap(client.get('/api/filters'));
