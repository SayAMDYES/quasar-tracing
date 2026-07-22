/**
 * In-memory imported Trace sessions and presentation-model adaptation.
 *
 * @author Quasar
 */

export function createRandomSessionId(crypto = globalThis.crypto) {
  if (crypto?.randomUUID) return crypto.randomUUID();
  if (!crypto?.getRandomValues) throw new Error('CRYPTO_UNAVAILABLE');
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function nanoToMillis(value) {
  try {
    return Number(BigInt(value) / 1_000_000n);
  } catch {
    return 0;
  }
}

function numericNano(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function attribute(attributes, ...keys) {
  for (const key of keys) {
    if (attributes?.[key]) return attributes[key];
  }
  return '';
}

export function traceDocumentToDetail(document) {
  const rootSpan = document.spans.find(({ spanId }) => spanId === document.root.spanId)
    || document.spans[0];
  const spans = document.spans.map((span) => ({
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    service: span.serviceName,
    name: span.name,
    kind: span.kind,
    timestamp: nanoToMillis(span.startTimeUnixNano),
    durationNs: span.durationNano,
    durationMs: numericNano(span.durationNano) / 1_000_000,
    statusCode: span.status.code,
    statusMessage: span.status.message,
    resourceAttributes: span.resourceAttributes,
    spanAttributes: span.spanAttributes,
    events: span.events.map((event) => ({
      name: event.name,
      timestamp: nanoToMillis(event.timeUnixNano),
      attributes: event.attributes,
    })),
  }));
  const errorCount = spans.filter(({ statusCode }) => (
    String(statusCode).toLowerCase() === 'error'
  )).length;
  const resourceAttributes = rootSpan?.resourceAttributes || {};
  const summary = {
    traceId: document.traceId,
    rootService: document.root.serviceName,
    rootName: document.root.name,
    startTime: nanoToMillis(document.startTimeUnixNano),
    durationNs: document.durationNano,
    spanCount: spans.length,
    errorCount,
    status: errorCount > 0 ? 'Error' : 'Ok',
    environment: attribute(
      resourceAttributes,
      'deployment.environment.name',
      'deployment.environment',
      'environment',
    ),
    host: attribute(resourceAttributes, 'host.name'),
    serviceInstanceId: attribute(resourceAttributes, 'service.instance.id'),
    k8sNamespace: attribute(resourceAttributes, 'k8s.namespace.name'),
    k8sPodName: attribute(resourceAttributes, 'k8s.pod.name'),
    k8sPodUid: attribute(resourceAttributes, 'k8s.pod.uid'),
    k8sNodeName: attribute(resourceAttributes, 'k8s.node.name'),
    services: document.services,
  };
  return { summary, spans, services: document.services };
}

export function createImportedTraceRepository(idFactory = createRandomSessionId) {
  const sessions = new Map();
  return {
    add(report, metadata = {}) {
      if (!Array.isArray(report?.accepted) || report.accepted.length === 0) {
        throw new Error('NO_IMPORTED_TRACES');
      }
      const sessionId = idFactory();
      if (!sessionId || sessions.has(sessionId)) throw new Error('DUPLICATE_IMPORT_SESSION_ID');
      const traces = new Map(report.accepted.map((trace) => [trace.traceId, trace]));
      const session = Object.freeze({
        sessionId,
        fileName: metadata.fileName || '',
        createdAt: metadata.createdAt || new Date().toISOString(),
        primaryTraceId: report.accepted[0].traceId,
        traceIds: Object.freeze([...traces.keys()]),
        rejected: Object.freeze([...(report.rejected || [])]),
        warnings: Object.freeze([...(report.warnings || [])]),
      });
      sessions.set(sessionId, { session, traces });
      return sessionId;
    },
    getSession(sessionId) {
      return sessions.get(sessionId)?.session || null;
    },
    getTrace(sessionId, traceId) {
      return sessions.get(sessionId)?.traces.get(traceId) || null;
    },
    remove(sessionId) {
      return sessions.delete(sessionId);
    },
    clear() {
      sessions.clear();
    },
  };
}
