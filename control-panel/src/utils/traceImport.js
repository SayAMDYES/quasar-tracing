/**
 * Browser-only Quasar Bundle and Jaeger Query JSON importer.
 *
 * @author Quasar
 */
import {
  TRACE_DOCUMENT_LIMITS,
  createTraceDocumentArtifact,
  normalizeTraceDocument,
} from './traceDocument.js';

const TRACE_ID_PATTERN = /^(?:[0-9a-fA-F]{16}|[0-9a-fA-F]{32})$/;
const SPAN_ID_PATTERN = /^[0-9a-fA-F]{1,16}$/;
const UNSIGNED_DECIMAL_PATTERN = /^[0-9]+$/;
const SIGNED_DECIMAL_PATTERN = /^-?[0-9]+$/;
const MAX_UINT64 = (1n << 64n) - 1n;
const TAG_TYPES = new Set(['string', 'bool', 'int64', 'float64', 'binary']);
const REFERENCE_TYPES = new Set(['CHILD_OF', 'FOLLOWS_FROM']);
const SPAN_KINDS = new Map([
  ['internal', 'Internal'],
  ['server', 'Server'],
  ['client', 'Client'],
  ['producer', 'Producer'],
  ['consumer', 'Consumer'],
]);
const STATUS_CODES = new Map([
  ['unset', 'Unset'],
  ['ok', 'Ok'],
  ['error', 'Error'],
]);

const TRACE_FIELDS = new Set(['traceID', 'spans', 'processes', 'warnings']);
const SPAN_FIELDS = new Set([
  'traceID', 'spanID', 'operationName', 'references', 'startTime', 'duration',
  'tags', 'logs', 'processID', 'warnings',
]);
const PROCESS_FIELDS = new Set(['serviceName', 'tags']);
const REFERENCE_FIELDS = new Set(['refType', 'traceID', 'spanID']);
const LOG_FIELDS = new Set(['timestamp', 'fields']);
const TAG_FIELDS = new Set(['key', 'type', 'value']);

export class TraceImportError extends Error {
  constructor(code, path = '$') {
    super(code);
    this.name = 'TraceImportError';
    this.code = code;
    this.path = path;
  }
}

function fail(code, path) {
  throw new TraceImportError(code, path);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function warning(code, spanId, message) {
  return { code, spanId, message };
}

function unknownFieldWarnings(value, allowed, path, spanId, warnings) {
  if (!isObject(value)) return;
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) {
      warnings.push(warning(
        'UNKNOWN_FIELD_IGNORED',
        spanId,
        `Ignored unknown field at ${path}.${key}`,
      ));
    }
  });
}

function normalizeTraceId(value, code = 'INVALID_TRACE_ID', path = '$.traceID') {
  if (typeof value !== 'string' || !TRACE_ID_PATTERN.test(value)) fail(code, path);
  return value.length === 16 ? value.padStart(32, '0').toLowerCase() : value.toLowerCase();
}

function normalizeSpanId(value, code = 'INVALID_SPAN_ID', path = '$.spanID') {
  if (typeof value !== 'string' || !SPAN_ID_PATTERN.test(value)) fail(code, path);
  return value.padStart(16, '0').toLowerCase();
}

function parseMicroseconds(value, code, path) {
  let microseconds;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) fail(code, path);
    microseconds = BigInt(value);
  } else if (typeof value === 'string' && UNSIGNED_DECIMAL_PATTERN.test(value)) {
    microseconds = BigInt(value);
  } else {
    fail(code, path);
  }
  const nanoseconds = microseconds * 1000n;
  if (nanoseconds > MAX_UINT64) fail(code, path);
  return nanoseconds.toString();
}

function validBase64(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0) return false;
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function normalizeTagValue(tag, path) {
  const type = tag.type == null ? null : String(tag.type).toLowerCase();
  if (type !== null && !TAG_TYPES.has(type)) fail('UNSUPPORTED_TAG_TYPE', `${path}.type`);
  const value = tag.value;

  if (type === 'string') {
    if (typeof value !== 'string') fail('TAG_TYPE_VALUE_CONFLICT', `${path}.value`);
    return value;
  }
  if (type === 'bool') {
    if (typeof value !== 'boolean') fail('TAG_TYPE_VALUE_CONFLICT', `${path}.value`);
    return String(value);
  }
  if (type === 'int64') {
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) fail('TAG_TYPE_VALUE_CONFLICT', `${path}.value`);
      return BigInt(value).toString();
    }
    if (typeof value !== 'string' || !SIGNED_DECIMAL_PATTERN.test(value)) {
      fail('TAG_TYPE_VALUE_CONFLICT', `${path}.value`);
    }
    return BigInt(value).toString();
  }
  if (type === 'float64') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail('TAG_TYPE_VALUE_CONFLICT', `${path}.value`);
    }
    return JSON.stringify(value);
  }
  if (type === 'binary') {
    if (!validBase64(value)) fail('TAG_TYPE_VALUE_CONFLICT', `${path}.value`);
    return value;
  }

  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      fail('UNSUPPORTED_TAG_VALUE', `${path}.value`);
    }
    return Number.isInteger(value) ? BigInt(value).toString() : JSON.stringify(value);
  }
  fail('UNSUPPORTED_TAG_VALUE', `${path}.value`);
}

function convertTags(tags, path, spanId, warnings) {
  if (tags == null) return { attributes: {}, originals: new Map() };
  if (!Array.isArray(tags)) fail('INVALID_TAGS', path);
  const attributes = {};
  const originals = new Map();
  tags.forEach((tag, index) => {
    const tagPath = `${path}[${index}]`;
    if (!isObject(tag)) fail('INVALID_TAG', tagPath);
    unknownFieldWarnings(tag, TAG_FIELDS, tagPath, spanId, warnings);
    if (typeof tag.key !== 'string' || tag.key.trim() === '') fail('INVALID_TAG_KEY', `${tagPath}.key`);
    const key = tag.key.trim();
    if (tag.value === null) {
      warnings.push(warning('NULL_TAG_IGNORED', spanId, `Ignored null tag at ${tagPath}.value`));
      return;
    }
    const normalized = normalizeTagValue(tag, tagPath);
    if (Object.hasOwn(attributes, key)) {
      if (attributes[key] !== normalized) fail('DUPLICATE_TAG_CONFLICT', `${tagPath}.key`);
      warnings.push(warning('DUPLICATE_TAG', spanId, `Duplicate tag ignored: ${key}`));
      return;
    }
    attributes[key] = normalized;
    originals.set(key, tag);
  });
  return { attributes, originals };
}

function appendJaegerWarnings(values, path, spanId, warnings) {
  if (values == null) return;
  if (!Array.isArray(values)) fail('INVALID_WARNING', path);
  values.forEach((value, index) => {
    let message;
    try {
      message = typeof value === 'string' ? value : String(value);
    } catch {
      fail('INVALID_WARNING', `${path}[${index}]`);
    }
    warnings.push(warning('JAEGER_WARNING', spanId, message));
  });
}

function isErrorIndicator(tag) {
  if (!tag) return false;
  const { value } = tag;
  if (value === true) return true;
  if (typeof value === 'string') return ['true', '1'].includes(value.trim().toLowerCase());
  return typeof value === 'number' && Number.isFinite(value) && value !== 0;
}

function firstNonEmptyString(originals, keys) {
  for (const key of keys) {
    const value = originals.get(key)?.value;
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return '';
}

function convertProcess(processes, processId, path, spanId, warnings) {
  const process = typeof processId === 'string' ? processes[processId] : null;
  if (!isObject(process)) {
    warnings.push(warning('MISSING_PROCESS', spanId, `Process not found at ${path}.processID`));
    return { serviceName: 'unknown-service', resourceAttributes: {} };
  }
  const processPath = `${path}.processes[${JSON.stringify(processId)}]`;
  unknownFieldWarnings(process, PROCESS_FIELDS, processPath, '', warnings);
  const serviceName = typeof process.serviceName === 'string' && process.serviceName.trim() !== ''
    ? process.serviceName.trim() : 'unknown-service';
  if (serviceName === 'unknown-service') {
    warnings.push(warning('MISSING_SERVICE_NAME', spanId, `Missing service name at ${processPath}.serviceName`));
  }
  const { attributes } = convertTags(process.tags, `${processPath}.tags`, '', warnings);
  if (Object.hasOwn(attributes, 'service.name') && attributes['service.name'] !== serviceName) {
    fail('SERVICE_NAME_CONFLICT', `${processPath}.tags`);
  }
  attributes['service.name'] = serviceName;
  return { serviceName, resourceAttributes: attributes };
}

function convertReferences(references, traceId, path, spanId, warnings) {
  if (references == null) return { parentSpanId: '', links: [] };
  if (!Array.isArray(references)) fail('INVALID_REFERENCES', path);
  const converted = references.map((reference, index) => {
    const referencePath = `${path}[${index}]`;
    if (!isObject(reference)) fail('INVALID_REFERENCE', referencePath);
    unknownFieldWarnings(reference, REFERENCE_FIELDS, referencePath, spanId, warnings);
    if (!REFERENCE_TYPES.has(reference.refType)) {
      fail('UNSUPPORTED_REFERENCE_TYPE', `${referencePath}.refType`);
    }
    return {
      refType: reference.refType,
      traceId: normalizeTraceId(
        reference.traceID,
        'INVALID_REFERENCE_TRACE_ID',
        `${referencePath}.traceID`,
      ),
      spanId: normalizeSpanId(
        reference.spanID,
        'INVALID_REFERENCE_SPAN_ID',
        `${referencePath}.spanID`,
      ),
    };
  });
  const parentCandidates = converted
    .map((reference, index) => ({ reference, index }))
    .filter(({ reference }) => reference.traceId === traceId);
  const selected = parentCandidates.find(({ reference }) => reference.refType === 'CHILD_OF')
    || parentCandidates.find(({ reference }) => reference.refType === 'FOLLOWS_FROM');
  if (parentCandidates.length > 1) {
    warnings.push(warning(
      'MULTIPLE_PARENT_REFERENCES',
      spanId,
      'Multiple same-Trace parent references found',
    ));
  }
  return {
    parentSpanId: selected?.reference.spanId || '',
    links: converted
      .filter((reference, index) => index !== selected?.index)
      .map((reference) => ({
        traceId: reference.traceId,
        spanId: reference.spanId,
        traceState: '',
        attributes: { 'jaeger.ref_type': reference.refType },
      })),
  };
}

function convertLogs(logs, path, spanId, warnings) {
  if (logs == null) return [];
  if (!Array.isArray(logs)) fail('INVALID_LOGS', path);
  return logs.map((log, index) => {
    const logPath = `${path}[${index}]`;
    if (!isObject(log)) fail('INVALID_LOG', logPath);
    unknownFieldWarnings(log, LOG_FIELDS, logPath, spanId, warnings);
    const { attributes } = convertTags(log.fields, `${logPath}.fields`, spanId, warnings);
    const event = attributes.event;
    return {
      timeUnixNano: parseMicroseconds(log.timestamp, 'INVALID_LOG_TIME', `${logPath}.timestamp`),
      name: typeof event === 'string' && event.trim() !== '' ? event.trim() : 'log',
      attributes,
    };
  });
}

function convertSpan(input, traceId, processes, tracePath, spanPath, normalizedSpanId, warnings) {
  unknownFieldWarnings(input, SPAN_FIELDS, spanPath, normalizedSpanId, warnings);
  const spanTraceId = normalizeTraceId(input.traceID, 'INVALID_TRACE_ID', `${spanPath}.traceID`);
  if (spanTraceId !== traceId) fail('TRACE_ID_CONFLICT', `${spanPath}.traceID`);
  if (typeof input.operationName !== 'string' || input.operationName.trim() === '') {
    fail('MISSING_OPERATION_NAME', `${spanPath}.operationName`);
  }
  const { serviceName, resourceAttributes } = convertProcess(
    processes,
    input.processID,
    tracePath,
    normalizedSpanId,
    warnings,
  );
  const { attributes: spanAttributes, originals } = convertTags(
    input.tags,
    `${spanPath}.tags`,
    normalizedSpanId,
    warnings,
  );
  const kindValue = spanAttributes['span.kind'];
  let kind = 'Internal';
  if (kindValue) {
    const normalizedKind = SPAN_KINDS.get(kindValue.toLowerCase());
    if (normalizedKind) kind = normalizedKind;
    else warnings.push(warning('UNKNOWN_SPAN_KIND', normalizedSpanId, `Unknown span.kind: ${kindValue}`));
  }

  const statusValue = spanAttributes['otel.status_code'];
  let explicitStatus = null;
  if (statusValue) {
    explicitStatus = STATUS_CODES.get(statusValue.toLowerCase());
    if (!explicitStatus) fail('INVALID_STATUS_CODE', `${spanPath}.tags`);
  }
  const errorIndicator = isErrorIndicator(originals.get('error'));
  if (errorIndicator && explicitStatus && explicitStatus !== 'Error') {
    warnings.push(warning('STATUS_CONFLICT', normalizedSpanId, 'Jaeger error tag overrides OTel status'));
  }
  const statusCode = errorIndicator ? 'Error' : (explicitStatus || 'Ok');
  const statusMessage = statusCode === 'Error'
    ? firstNonEmptyString(originals, ['otel.status_description', 'error.message', 'message']) || 'error'
    : '';
  const references = convertReferences(
    input.references,
    traceId,
    `${spanPath}.references`,
    normalizedSpanId,
    warnings,
  );
  appendJaegerWarnings(input.warnings, `${spanPath}.warnings`, normalizedSpanId, warnings);

  return {
    traceId,
    spanId: normalizedSpanId,
    parentSpanId: references.parentSpanId,
    traceState: '',
    serviceName,
    name: input.operationName.trim(),
    kind,
    startTimeUnixNano: parseMicroseconds(input.startTime, 'INVALID_SPAN_TIME', `${spanPath}.startTime`),
    durationNano: parseMicroseconds(input.duration, 'INVALID_SPAN_TIME', `${spanPath}.duration`),
    status: { code: statusCode, message: statusMessage },
    resourceAttributes,
    scope: {
      name: spanAttributes['otel.library.name'] || '',
      version: spanAttributes['otel.library.version'] || '',
    },
    spanAttributes,
    events: convertLogs(input.logs, `${spanPath}.logs`, normalizedSpanId, warnings),
    links: references.links,
  };
}

export function convertJaegerTrace(input, path = '$') {
  if (!isObject(input)) fail('INVALID_JAEGER_TRACE', path);
  unknownFieldWarnings(input, TRACE_FIELDS, path, '', []);
  const traceId = normalizeTraceId(input.traceID, 'INVALID_TRACE_ID', `${path}.traceID`);
  if (!Array.isArray(input.spans) || input.spans.length === 0) fail('TRACE_HAS_NO_SPANS', `${path}.spans`);
  if (input.spans.length > TRACE_DOCUMENT_LIMITS.maxSpansPerTrace) {
    fail('TOO_MANY_SPANS_PER_TRACE', `${path}.spans`);
  }
  if (!isObject(input.processes)) fail('MISSING_PROCESSES', `${path}.processes`);

  const warnings = [];
  unknownFieldWarnings(input, TRACE_FIELDS, path, '', warnings);
  appendJaegerWarnings(input.warnings, `${path}.warnings`, '', warnings);
  const spanIds = new Set();
  const normalizedSpanIds = input.spans.map((span, index) => {
    if (!isObject(span)) fail('INVALID_SPAN', `${path}.spans[${index}]`);
    const spanId = normalizeSpanId(span.spanID, 'INVALID_SPAN_ID', `${path}.spans[${index}].spanID`);
    if (spanIds.has(spanId)) fail('DUPLICATE_SPAN_ID', `${path}.spans[${index}].spanID`);
    spanIds.add(spanId);
    return spanId;
  });
  const spans = input.spans.map((span, index) => convertSpan(
    span,
    traceId,
    input.processes,
    path,
    `${path}.spans[${index}]`,
    normalizedSpanIds[index],
    warnings,
  ));
  return normalizeTraceDocument({ traceId, warnings, spans });
}

function rejection(error, index = null, traceId = '') {
  return {
    index,
    traceId,
    code: typeof error?.code === 'string' ? error.code : 'TRACE_IMPORT_ERROR',
    path: typeof error?.path === 'string' ? error.path : '$',
    message: typeof error?.code === 'string' ? error.code : 'TRACE_IMPORT_ERROR',
  };
}

function failedResult(error) {
  return { accepted: [], rejected: [rejection(error)], warnings: [] };
}

function looksLikeJsonLines(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  return lines.every((line) => {
    try {
      JSON.parse(line);
      return true;
    } catch {
      return false;
    }
  });
}

function validateInputCounts(traces, paths) {
  if (traces.length > TRACE_DOCUMENT_LIMITS.maxTracesPerBundle) fail('TOO_MANY_TRACES', '$');
  let total = 0;
  traces.forEach((trace, index) => {
    const count = Array.isArray(trace?.spans) ? trace.spans.length : 0;
    if (count > TRACE_DOCUMENT_LIMITS.maxSpansPerTrace) {
      fail('TOO_MANY_SPANS_PER_TRACE', `${paths[index]}.spans`);
    }
    total += count;
  });
  if (total > TRACE_DOCUMENT_LIMITS.maxSpansPerBundle) fail('TOO_MANY_SPANS_PER_BUNDLE', '$');
}

function parseBundle(value) {
  if (value.version !== 1) fail('UNSUPPORTED_BUNDLE_VERSION', '$.version');
  if (value.partial === true) fail('PARTIAL_BUNDLE_NOT_IMPORTABLE', '$.partial');
  if (!Array.isArray(value.failures)) fail('INVALID_FAILURES', '$.failures');
  if (value.failures.length > 0) fail('INVALID_BUNDLE_FAILURES', '$.failures');
  if (!Array.isArray(value.traces)) fail('INVALID_TRACES', '$.traces');
  const paths = value.traces.map((_, index) => `$.traces[${index}]`);
  validateInputCounts(value.traces, paths);
  return { format: 'quasar', traces: value.traces, paths, wrapperWarnings: [] };
}

function unsupportedPayload(value) {
  if (isObject(value) && Object.hasOwn(value, 'resourceSpans')) return 'UNSUPPORTED_OTLP_JSON';
  if (Array.isArray(value) && value.some((item) => isObject(item)
    && ('id' in item || 'timestamp' in item) && ('traceId' in item || 'traceID' in item))) {
    return 'UNSUPPORTED_ZIPKIN_JSON';
  }
  return null;
}

function unwrapJaeger(value) {
  const unsupported = unsupportedPayload(value);
  if (unsupported) fail(unsupported, '$');
  let traces;
  let paths;
  const wrapperWarnings = [];
  if (Array.isArray(value)) {
    traces = value;
    paths = value.map((_, index) => `$[${index}]`);
  } else if (isObject(value) && Object.hasOwn(value, 'data')) {
    const data = Array.isArray(value.data) ? value.data : [value.data];
    traces = data;
    paths = data.map((_, index) => Array.isArray(value.data) ? `$.data[${index}]` : '$.data');
    Object.keys(value).filter((key) => key !== 'data').forEach((key) => {
      wrapperWarnings.push({ code: 'UNKNOWN_FIELD_IGNORED', path: `$.${key}` });
    });
  } else {
    traces = [value];
    paths = ['$'];
  }
  if (traces.some((trace) => !isObject(trace) || !Array.isArray(trace.spans))) {
    fail('TRACE_HAS_NO_SPANS', paths[traces.findIndex((trace) => !isObject(trace) || !Array.isArray(trace.spans))]);
  }
  validateInputCounts(traces, paths);
  return { format: 'jaeger', traces, paths, wrapperWarnings };
}

function collectWarnings(accepted, wrapperWarnings) {
  return [
    ...wrapperWarnings,
    ...accepted.flatMap((trace) => trace.warnings.map((item) => ({ traceId: trace.traceId, ...item }))),
  ];
}

export function parseTraceImportText(text, options = {}) {
  if (typeof text !== 'string') return failedResult(new TraceImportError('INVALID_JSON'));
  const byteSize = options.byteSize ?? new TextEncoder().encode(text).byteLength;
  if (byteSize > TRACE_DOCUMENT_LIMITS.maxBundleBytes) {
    return failedResult(new TraceImportError('IMPORT_FILE_TOO_LARGE'));
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return failedResult(new TraceImportError(looksLikeJsonLines(text) ? 'UNSUPPORTED_JSONL' : 'INVALID_JSON'));
  }

  try {
    const unwrapped = isObject(value) && value.schema === 'quasar.trace.bundle'
      ? parseBundle(value) : unwrapJaeger(value);
    const accepted = [];
    const rejected = [];
    const traceIds = new Set();
    unwrapped.traces.forEach((trace, index) => {
      try {
        const normalized = unwrapped.format === 'quasar'
          ? normalizeTraceDocument(trace)
          : convertJaegerTrace(trace, unwrapped.paths[index]);
        const document = createTraceDocumentArtifact(normalized).document;
        if (traceIds.has(document.traceId)) {
          rejected.push(rejection(
            new TraceImportError('DUPLICATE_TRACE_ID', `${unwrapped.paths[index]}.traceID`),
            index,
            document.traceId,
          ));
          return;
        }
        traceIds.add(document.traceId);
        accepted.push(document);
      } catch (error) {
        rejected.push(rejection(error, index));
      }
    });
    return {
      accepted,
      rejected,
      warnings: collectWarnings(accepted, unwrapped.wrapperWarnings),
    };
  } catch (error) {
    return failedResult(error);
  }
}

export async function parseTraceImportFile(file, parser = parseTraceImportText) {
  if (!file || typeof file.name !== 'string' || !file.name.toLowerCase().endsWith('.json')) {
    return failedResult(new TraceImportError('UNSUPPORTED_FILE_TYPE'));
  }
  if (!Number.isFinite(file.size) || file.size < 0) {
    return failedResult(new TraceImportError('INVALID_FILE_SIZE'));
  }
  if (file.size > TRACE_DOCUMENT_LIMITS.maxBundleBytes) {
    return failedResult(new TraceImportError('IMPORT_FILE_TOO_LARGE'));
  }
  let text;
  try {
    const bytes = await file.arrayBuffer();
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return failedResult(new TraceImportError('INVALID_UTF8'));
  }
  return parser(text, { byteSize: file.size });
}
