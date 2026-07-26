/**
 * Canonical Quasar Trace Document v1 normalization.
 *
 * @author Quasar
 */

export const MAX_TRACE_DOCUMENT_BYTES = 50 * 1024 * 1024;
export const MAX_SPANS_PER_TRACE = 20_000;

export const TRACE_DOCUMENT_LIMITS = Object.freeze({
  maxDocumentBytes: MAX_TRACE_DOCUMENT_BYTES,
  maxSpansPerTrace: MAX_SPANS_PER_TRACE,
});

const TRACE_ID_PATTERN = /^[0-9a-fA-F]{32}$/;
const SPAN_ID_PATTERN = /^[0-9a-fA-F]{16}$/;
const UNSIGNED_DECIMAL_PATTERN = /^[0-9]+$/;
const MAX_WARNING_MESSAGE_CODE_POINTS = 512;
const canonicalObjectKeys = new WeakMap();

class TraceDocumentError extends Error {
  constructor(code) {
    super(code);
    this.name = 'TraceDocumentError';
    this.code = code;
  }
}

function fail(code) {
  throw new TraceDocumentError(code);
}

function valueOrEmpty(value) {
  return value == null ? '' : String(value);
}

function compareUnicode(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0));
  const rightPoints = Array.from(right, (character) => character.codePointAt(0));
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

function compareText(left, right) {
  return compareUnicode(valueOrEmpty(left), valueOrEmpty(right));
}

function normalizeTraceId(value) {
  if (typeof value !== 'string' || !TRACE_ID_PATTERN.test(value)) fail('INVALID_TRACE_ID');
  return value.toLowerCase();
}

function normalizeSpanId(value) {
  if (typeof value !== 'string' || !SPAN_ID_PATTERN.test(value)) fail('INVALID_SPAN_ID');
  return value.toLowerCase();
}

function parseUnsigned(value, code) {
  if (typeof value !== 'string' || !UNSIGNED_DECIMAL_PATTERN.test(value)) fail(code);
  return BigInt(value);
}

function sortedAttributes(attributes) {
  if (attributes == null) return {};
  if (typeof attributes !== 'object' || Array.isArray(attributes)) fail('INVALID_ATTRIBUTES');
  const entries = Object.entries(attributes)
    .sort(([left], [right]) => compareUnicode(left, right))
    .map(([key, value]) => [key, valueOrEmpty(value)]);
  const sorted = Object.fromEntries(entries);
  canonicalObjectKeys.set(sorted, entries.map(([key]) => key));
  return sorted;
}

function normalizeEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) fail('INVALID_EVENT');
  return {
    timeUnixNano: parseUnsigned(event.timeUnixNano, 'INVALID_EVENT_TIME_UNIX_NANO').toString(),
    name: valueOrEmpty(event.name),
    attributes: sortedAttributes(event.attributes),
  };
}

function normalizeLink(link) {
  if (!link || typeof link !== 'object' || Array.isArray(link)) fail('INVALID_LINK');
  return {
    traceId: normalizeTraceId(link.traceId),
    spanId: normalizeSpanId(link.spanId),
    traceState: valueOrEmpty(link.traceState),
    attributes: sortedAttributes(link.attributes),
  };
}

function normalizeArray(value, code) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(code);
  return value;
}

function normalizeSpan(traceId, span) {
  if (!span || typeof span !== 'object' || Array.isArray(span)) fail('INVALID_SPAN');
  const spanTraceId = valueOrEmpty(span.traceId);
  if (spanTraceId && normalizeTraceId(spanTraceId) !== traceId) fail('TRACE_ID_MISMATCH');
  const parentSpanId = valueOrEmpty(span.parentSpanId);
  const start = parseUnsigned(span.startTimeUnixNano, 'INVALID_START_TIME_UNIX_NANO');
  const duration = parseUnsigned(span.durationNano, 'INVALID_DURATION_NANO');
  const status = span.status && typeof span.status === 'object' && !Array.isArray(span.status)
    ? span.status : {};
  const scope = span.scope && typeof span.scope === 'object' && !Array.isArray(span.scope)
    ? span.scope : {};

  return {
    value: {
      traceId,
      spanId: normalizeSpanId(span.spanId),
      parentSpanId: parentSpanId ? normalizeSpanId(parentSpanId) : '',
      traceState: valueOrEmpty(span.traceState),
      serviceName: valueOrEmpty(span.serviceName),
      name: valueOrEmpty(span.name),
      kind: valueOrEmpty(span.kind),
      startTimeUnixNano: start.toString(),
      durationNano: duration.toString(),
      status: {
        code: valueOrEmpty(status.code),
        message: valueOrEmpty(status.message),
      },
      resourceAttributes: sortedAttributes(span.resourceAttributes),
      scope: {
        name: valueOrEmpty(scope.name),
        version: valueOrEmpty(scope.version),
      },
      spanAttributes: sortedAttributes(span.spanAttributes),
      events: normalizeArray(span.events, 'INVALID_EVENTS').map(normalizeEvent),
      links: normalizeArray(span.links, 'INVALID_LINKS').map(normalizeLink),
    },
    start,
    duration,
  };
}

function compareNodes(left, right) {
  if (left.start !== right.start) return left.start < right.start ? -1 : 1;
  return compareUnicode(left.value.spanId, right.value.spanId);
}

function warning(code, spanId, message) {
  return { code, spanId, message };
}

function normalizeWarnings(warnings) {
  const normalized = normalizeArray(warnings, 'INVALID_WARNINGS')
    .filter((item) => item != null)
    .map((item) => {
      if (typeof item !== 'object' || Array.isArray(item)) fail('INVALID_WARNING');
      const spanId = valueOrEmpty(item.spanId);
      return warning(
        valueOrEmpty(item.code),
        spanId ? normalizeSpanId(spanId) : '',
        Array.from(valueOrEmpty(item.message)).slice(0, MAX_WARNING_MESSAGE_CODE_POINTS).join(''),
      );
    })
    .sort((left, right) => compareText(left.code, right.code)
      || compareText(left.spanId, right.spanId)
      || compareText(left.message, right.message));

  return normalized.filter((item, index) => index === 0
    || item.code !== normalized[index - 1].code
    || item.spanId !== normalized[index - 1].spanId
    || item.message !== normalized[index - 1].message);
}

function findCycleRepresentatives(nodes, nodesById) {
  const representatives = [];
  const processed = new Set();
  for (const start of nodes) {
    if (processed.has(start.value.spanId)) continue;
    const path = [];
    const pathIndexes = new Map();
    let current = start;
    while (current && !processed.has(current.value.spanId)) {
      const cycleStart = pathIndexes.get(current.value.spanId);
      if (cycleStart !== undefined) {
        representatives.push(path.slice(cycleStart).sort(compareNodes)[0]);
        break;
      }
      pathIndexes.set(current.value.spanId, path.length);
      path.push(current);
      current = nodesById.get(current.value.parentSpanId);
    }
    path.forEach((node) => processed.add(node.value.spanId));
  }
  return representatives;
}

/**
 * Rebuilds a canonical v1 Trace Document without mutating or trusting derived input fields.
 */
export function normalizeTraceDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) fail('INVALID_TRACE_DOCUMENT');
  const traceId = normalizeTraceId(document.traceId);
  const inputSpans = normalizeArray(document.spans, 'INVALID_SPANS');
  if (inputSpans.length === 0) fail('TRACE_HAS_NO_SPANS');
  if (inputSpans.length > TRACE_DOCUMENT_LIMITS.maxSpansPerTrace) fail('TOO_MANY_SPANS_PER_TRACE');

  const nodes = inputSpans.map((span) => normalizeSpan(traceId, span)).sort(compareNodes);
  const nodesById = new Map();
  for (const node of nodes) {
    if (nodesById.has(node.value.spanId)) fail('DUPLICATE_SPAN_ID');
    nodesById.set(node.value.spanId, node);
  }

  const derivedWarnings = [];
  const naturalRoots = [];
  const orphanRoots = [];
  for (const node of nodes) {
    if (!node.value.parentSpanId) naturalRoots.push(node);
    else if (!nodesById.has(node.value.parentSpanId)) {
      orphanRoots.push(node);
      derivedWarnings.push(warning(
        'MISSING_PARENT',
        node.value.spanId,
        `Parent span not found: ${node.value.parentSpanId}`,
      ));
    }
  }

  const cycleRoots = findCycleRepresentatives(nodes, nodesById).sort(compareNodes);
  cycleRoots.forEach((node) => derivedWarnings.push(
    warning('PARENT_CYCLE', node.value.spanId, 'Parent cycle detected'),
  ));
  naturalRoots.sort(compareNodes);
  orphanRoots.sort(compareNodes);

  const candidates = naturalRoots.length + orphanRoots.length + cycleRoots.length;
  if (candidates > 1) {
    derivedWarnings.push(warning('MULTIPLE_ROOTS', '', 'Trace has multiple root candidates'));
  }

  const [rootNode, selection] = naturalRoots.length > 0
    ? [naturalRoots[0], 'natural']
    : orphanRoots.length > 0
      ? [orphanRoots[0], 'orphan']
      : cycleRoots.length > 0
        ? [cycleRoots[0], 'cycle']
        : fail('TRACE_HAS_NO_ROOT_CANDIDATE');

  const start = nodes.reduce((minimum, node) => node.start < minimum ? node.start : minimum,
    nodes[0].start);
  const end = nodes.reduce((maximum, node) => {
    const nodeEnd = node.start + node.duration;
    return nodeEnd > maximum ? nodeEnd : maximum;
  }, nodes[0].start + nodes[0].duration);
  const services = [...new Set(nodes.map((node) => node.value.serviceName))].sort(compareUnicode);

  return {
    traceId,
    startTimeUnixNano: start.toString(),
    durationNano: (end - start).toString(),
    root: {
      spanId: rootNode.value.spanId,
      serviceName: rootNode.value.serviceName,
      name: rootNode.value.name,
      selection,
    },
    services,
    warnings: normalizeWarnings([
      ...normalizeArray(document.warnings, 'INVALID_WARNINGS'),
      ...derivedWarnings,
    ]),
    spans: nodes.map((node) => node.value),
  };
}

function appendCanonicalJson(value, depth, chunks) {
  if (value === null || typeof value !== 'object') {
    chunks.push(JSON.stringify(value));
    return;
  }
  const indentation = '  '.repeat(depth);
  const childIndentation = `${indentation}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) {
      chunks.push('[]');
      return;
    }
    chunks.push('[\n');
    value.forEach((item, index) => {
      chunks.push(childIndentation);
      appendCanonicalJson(item, depth + 1, chunks);
      chunks.push(index + 1 === value.length ? '\n' : ',\n');
    });
    chunks.push(indentation, ']');
    return;
  }

  const keys = canonicalObjectKeys.get(value) || Object.keys(value);
  if (keys.length === 0) {
    chunks.push('{}');
    return;
  }
  chunks.push('{\n');
  keys.forEach((key, index) => {
    chunks.push(childIndentation, JSON.stringify(key), ': ');
    appendCanonicalJson(value[key], depth + 1, chunks);
    chunks.push(index + 1 === keys.length ? '\n' : ',\n');
  });
  chunks.push(indentation, '}');
}

function canonicalStringify(value) {
  const chunks = [];
  appendCanonicalJson(value, 0, chunks);
  chunks.push('\n');
  return chunks.join('');
}

/** Serializes a normalized v1 Trace Document for the JSON viewer. */
export function stableStringifyTraceDocument(document) {
  return canonicalStringify(normalizeTraceDocument(document));
}

/** Builds normalized viewer bytes in one canonicalization pass. */
export function createTraceDocumentArtifact(input) {
  const document = normalizeTraceDocument(input);
  const canonical = canonicalStringify(document);
  const byteSize = new Blob([canonical]).size;
  if (byteSize > TRACE_DOCUMENT_LIMITS.maxDocumentBytes) fail('TRACE_DOCUMENT_TOO_LARGE');
  deepFreeze(document);
  return { document, canonical, byteSize };
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((child) => deepFreeze(child, seen));
  return Object.freeze(value);
}
