/**
 * Pure transformations for carrying an investigation time window and entity
 * context across pages without coupling the source page to router APIs.
 *
 * @author Quasar
 */
import { encodeTraceSearchParams } from './traceSearchParams.js';

const TRACE_WINDOW_PADDING_MS = 5 * 60 * 1000;

function isValidRange(range) {
  return Number.isFinite(range?.from)
    && Number.isFinite(range?.to)
    && Number.isInteger(range.from)
    && Number.isInteger(range.to)
    && range.from < range.to;
}

export function traceInvestigationWindow(summary, now = Date.now()) {
  const startTime = summary?.startTime;
  const durationNs = summary?.durationNs;
  if (!Number.isFinite(startTime)
    || !Number.isFinite(durationNs)
    || durationNs < 0
    || !Number.isFinite(now)) {
    return null;
  }

  const from = Math.floor(startTime - TRACE_WINDOW_PADDING_MS);
  const calculatedTo = Math.ceil(startTime + (durationNs / 1e6) + TRACE_WINDOW_PADDING_MS);
  const to = Math.min(calculatedTo, Math.floor(now));
  const range = { from, to };
  return isValidRange(range) ? range : null;
}

function nonBlankText(value) {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function resourceValue(resourceAttributes, key) {
  if (!resourceAttributes || typeof resourceAttributes !== 'object' || Array.isArray(resourceAttributes)) {
    return undefined;
  }
  return nonBlankText(resourceAttributes[key]);
}

export function spanInvestigationContext(span, summary, now = Date.now()) {
  if (!span || typeof span !== 'object' || Array.isArray(span)) return null;

  const window = traceInvestigationWindow(summary, now);
  const namespace = resourceValue(span.resourceAttributes, 'service.namespace')
    || resourceValue(span.resourceAttributes, 'k8s.namespace.name')
    || nonBlankText(summary?.k8sNamespace);
  const statusCode = nonBlankText(span.statusCode);

  return {
    from: window?.from,
    to: window?.to,
    service: nonBlankText(span.service),
    operation: nonBlankText(span.name),
    traceId: nonBlankText(span.traceId) || nonBlankText(summary?.traceId),
    spanId: nonBlankText(span.spanId),
    serviceInstanceId: resourceValue(span.resourceAttributes, 'service.instance.id')
      || nonBlankText(summary?.serviceInstanceId),
    environment: resourceValue(span.resourceAttributes, 'deployment.environment.name')
      || nonBlankText(summary?.environment),
    namespace,
    spanStatus: statusCode?.toLowerCase() === 'error' ? 'error' : undefined,
  };
}

export function readInvestigationRange(searchParams) {
  const params = searchParams instanceof URLSearchParams
    ? searchParams
    : new URLSearchParams(searchParams);
  const rawFrom = params.get('from');
  const rawTo = params.get('to');
  if (!rawFrom?.trim() || !rawTo?.trim()) return null;

  const range = { from: Number(rawFrom), to: Number(rawTo) };
  return isValidRange(range) ? range : null;
}

export const parseInvestigationRange = readInvestigationRange;

export function clampInvestigationRange(range, now = Date.now()) {
  if (!isValidRange(range) || !Number.isFinite(now)) return null;

  const clampedRange = { from: range.from, to: Math.min(range.to, Math.floor(now)) };
  return isValidRange(clampedRange) ? clampedRange : null;
}

function setNonEmptyParam(searchParams, key, value) {
  if (value == null || String(value).trim() === '') return;
  searchParams.set(key, String(value));
}

export function buildInvestigationPath(destination, context) {
  const range = { from: context?.from, to: context?.to };
  if (!isValidRange(range)) return null;

  let path;
  switch (destination) {
    case 'traces':
      path = '/traces';
      break;
    case 'logs':
      path = '/logs';
      break;
    case 'metrics':
      path = '/metrics';
      break;
    case 'services':
      path = '/services';
      break;
    default:
      return null;
  }

  const searchParams = new URLSearchParams({
    from: String(range.from),
    to: String(range.to),
  });
  if (destination === 'traces') {
    setNonEmptyParam(searchParams, 'spanService', context.service);
    setNonEmptyParam(searchParams, 'spanOperation', context.operation);
    if (context.spanStatus === 'error') {
      searchParams.set('spanStatus', 'error');
    }
    if (context.attributeConditions !== undefined) {
      try {
        const traceParams = encodeTraceSearchParams({
          attributeConditions: context.attributeConditions,
        });
        if (traceParams.has('attributes')) {
          searchParams.set('attributes', traceParams.get('attributes'));
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Invalid attribute conditions:')) {
          return null;
        }
        throw error;
      }
    }
  } else if (destination === 'logs') {
    setNonEmptyParam(searchParams, 'traceId', context.traceId);
    setNonEmptyParam(searchParams, 'spanId', context.spanId);
    setNonEmptyParam(searchParams, 'service', context.service);
    setNonEmptyParam(searchParams, 'q', context.q);
    setNonEmptyParam(searchParams, 'serviceInstanceId', context.serviceInstanceId);
    setNonEmptyParam(searchParams, 'environment', context.environment);
    setNonEmptyParam(searchParams, 'namespace', context.namespace);
  } else if (destination === 'metrics') {
    setNonEmptyParam(searchParams, 'service', context.service);
    setNonEmptyParam(searchParams, 'serviceInstanceId', context.serviceInstanceId);
    setNonEmptyParam(searchParams, 'environment', context.environment);
    setNonEmptyParam(searchParams, 'namespace', context.namespace);
  } else {
    setNonEmptyParam(searchParams, 'focus', context.service);
  }

  return `${path}?${searchParams.toString()}`;
}

export function buildTraceAttributeSearchPath(condition, window) {
  return buildInvestigationPath('traces', {
    from: window?.from,
    to: window?.to,
    attributeConditions: [condition],
  });
}
