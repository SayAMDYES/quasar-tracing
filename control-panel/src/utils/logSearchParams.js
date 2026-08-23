/**
 * Shareable URL model for Log Search filters and trace/span correlation scope.
 *
 * @author Quasar
 */

const RESOURCE_FILTER_KEYS = [
  'environment',
  'namespace',
  'k8sPodName',
  'k8sNodeName',
  'serviceInstanceId',
];

function paramsOf(value) {
  return value instanceof URLSearchParams ? value : new URLSearchParams(value);
}

function nonBlank(value) {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function setNonBlank(params, key, value) {
  const normalized = nonBlank(value);
  if (normalized !== undefined) params.set(key, normalized);
}

export function decodeLogSearchParams(value) {
  const params = paramsOf(value);
  const severities = (params.get('severities') || '')
    .split(',')
    .map((severity) => severity.trim())
    .filter(Boolean);
  const filters = {
    q: nonBlank(params.get('q')) || '',
    service: nonBlank(params.get('service')),
    severities,
    environment: nonBlank(params.get('environment')),
    namespace: nonBlank(params.get('namespace')),
    k8sPodName: nonBlank(params.get('k8sPodName')),
    k8sNodeName: nonBlank(params.get('k8sNodeName')),
    serviceInstanceId: nonBlank(params.get('serviceInstanceId')),
  };
  return {
    traceId: nonBlank(params.get('traceId')),
    spanId: nonBlank(params.get('spanId')),
    filters,
  };
}

export function encodeLogSearchParams(filters = {}, { range, traceId, spanId } = {}) {
  const params = new URLSearchParams();
  if (range) {
    params.set('from', String(range.from));
    params.set('to', String(range.to));
  }
  setNonBlank(params, 'traceId', traceId);
  setNonBlank(params, 'spanId', spanId);
  setNonBlank(params, 'q', filters.q);
  setNonBlank(params, 'service', filters.service);
  if (Array.isArray(filters.severities) && filters.severities.length > 0) {
    const severities = filters.severities.map(nonBlank).filter(Boolean);
    if (severities.length > 0) params.set('severities', severities.join(','));
  }
  RESOURCE_FILTER_KEYS.forEach((key) => setNonBlank(params, key, filters[key]));
  return params;
}
