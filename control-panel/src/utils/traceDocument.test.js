import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import client from '../api/client.js';
import { fetchTraceDocument } from '../api/index.js';
import { createTraceWorkerClient } from '../workers/traceWorkerClient.js';
import {
  TRACE_BUNDLE_MIME_TYPE,
  TRACE_DOCUMENT_LIMITS,
  createTraceBundle,
  createTraceBundleArtifact,
  createTraceDocumentArtifact,
  normalizeTraceDocument,
  stableStringifyTraceDocument,
  stableStringifyTraceBundle,
} from './traceDocument.js';

const TRACE_ID = (suffix) => suffix.toString(16).padStart(32, '0');
const SPAN_ID = (suffix) => suffix.toString(16).padStart(16, '0');

function span(id, parentSpanId = '', start = '1', duration = '1', overrides = {}) {
  return {
    traceId: overrides.traceId,
    spanId: SPAN_ID(id).toUpperCase(),
    parentSpanId,
    serviceName: 'service',
    name: `span-${id}`,
    startTimeUnixNano: start,
    durationNano: duration,
    ...overrides,
  };
}

function document(traceId, spans, overrides = {}) {
  return { traceId, spans, ...overrides };
}

function spans(count, traceSuffix = 1) {
  return Array.from({ length: count }, (_, index) => span(index + 1, '', String(index), '1', {
    traceId: TRACE_ID(traceSuffix),
  }));
}

function extractCanonicalTraces(canonicalBundle) {
  const marker = '  "traces": ';
  const start = canonicalBundle.indexOf(marker);
  assert.notEqual(start, -1);
  return canonicalBundle.slice(start + marker.length, -2).replace(/^  /gm, '');
}

test('matches the Java common golden documents byte for byte', async () => {
  const fixtureUrl = new URL(
    '../../../platform/quasar-tracing-common/src/test/resources/trace-document-v1-golden.json',
    import.meta.url,
  );
  const expected = await readFile(fixtureUrl, 'utf8');
  const input = JSON.parse(expected).map((trace) => ({
    ...trace,
    traceId: trace.traceId.toUpperCase(),
    startTimeUnixNano: '0',
    durationNano: '0',
    root: { spanId: '', serviceName: '', name: '', selection: '' },
    services: [...trace.services].reverse(),
    spans: [...trace.spans].reverse(),
  }));

  const bundle = createTraceBundle(input, {
    generatedAt: '2026-07-19T12:00:00.000Z',
    generatorVersion: '1.0.7',
  });
  const actual = extractCanonicalTraces(stableStringifyTraceBundle(bundle));
  assert.equal(actual, expected);
  assert.match(actual, /"startTimeUnixNano": "18446744073709551616"/);
  assert.ok(actual.indexOf('"10": "ten"') < actual.indexOf('"2": "two"'));
});

test('normalizes defaults, Unicode maps and warnings without inferring values', () => {
  const longMessage = '😀'.repeat(513);
  const normalized = normalizeTraceDocument(document(TRACE_ID(7).toUpperCase(), [span(1, '', '01', '2', {
    traceState: null,
    serviceName: null,
    name: null,
    kind: null,
    status: null,
    resourceAttributes: { '😀': 7, '\uE000': false },
    scope: null,
    spanAttributes: { number: '001', bool: 'false' },
    events: [{ timeUnixNano: '0003', name: null, attributes: null }],
    links: [],
  })], {
    warnings: [
      { code: 'Z_WARNING', spanId: '', message: longMessage },
      { code: 'A_WARNING' },
      { code: 'Z_WARNING', spanId: '', message: longMessage },
    ],
  }));

  assert.equal(normalized.startTimeUnixNano, '1');
  assert.equal(normalized.durationNano, '2');
  assert.deepEqual(Object.keys(normalized.spans[0].resourceAttributes), ['\uE000', '😀']);
  assert.deepEqual(normalized.spans[0].resourceAttributes, { '\uE000': 'false', '😀': '7' });
  assert.deepEqual(normalized.spans[0].spanAttributes, { bool: 'false', number: '001' });
  assert.deepEqual(normalized.spans[0].status, { code: '', message: '' });
  assert.deepEqual(normalized.spans[0].scope, { name: '', version: '' });
  assert.equal([...normalized.warnings[1].message].length, 512);
  assert.deepEqual(normalized.warnings.map(({ code }) => code), ['A_WARNING', 'Z_WARNING']);
});

test('derives deterministic natural, orphan and cycle topology from shuffled spans', () => {
  const natural = span(1, '', '100', '1', { name: 'natural' });
  const orphan = span(2, SPAN_ID(9), '1', '2', { name: 'orphan' });
  const cycleA = span(3, SPAN_ID(4), '20', '2');
  const cycleB = span(4, SPAN_ID(3), '10', '20');
  const input = document(TRACE_ID(1), [cycleA, natural, orphan, cycleB], {
    root: { selection: 'untrusted' },
    startTimeUnixNano: '999',
    durationNano: '999',
  });

  const forward = normalizeTraceDocument(input);
  const reversed = normalizeTraceDocument({ ...input, spans: [...input.spans].reverse() });
  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward.root, {
    spanId: SPAN_ID(1), serviceName: 'service', name: 'natural', selection: 'natural',
  });
  assert.equal(forward.startTimeUnixNano, '1');
  assert.equal(forward.durationNano, '100');
  assert.deepEqual(forward.warnings.map(({ code, spanId }) => [code, spanId]), [
    ['MISSING_PARENT', SPAN_ID(2)],
    ['MULTIPLE_ROOTS', ''],
    ['PARENT_CYCLE', SPAN_ID(4)],
  ]);
  assert.equal(forward.spans.find(({ spanId }) => spanId === SPAN_ID(4)).parentSpanId, SPAN_ID(3));
});

test('rejects invalid topology fields with stable payload-free errors', () => {
  const cases = [
    [document(TRACE_ID(1), []), 'TRACE_HAS_NO_SPANS'],
    [document('bad', [span(1)]), 'INVALID_TRACE_ID'],
    [document(TRACE_ID(1), [span(1), span(1)]), 'DUPLICATE_SPAN_ID'],
    [document(TRACE_ID(1), [span(1, '', '-1')]), 'INVALID_START_TIME_UNIX_NANO'],
  ];
  for (const [input, code] of cases) {
    assert.throws(() => normalizeTraceDocument(input), { message: code, code });
  }
});

test('creates canonical v1 bundles and enforces producer limits', () => {
  const trace = document(TRACE_ID(1), [span(1)]);
  const bundle = createTraceBundle([trace], {
    generatedAt: '2026-07-19T12:00:00.000Z',
    generatorVersion: '1.0.7',
  });

  assert.deepEqual(Object.keys(bundle), [
    'schema', 'version', 'generatedAt', 'generator', 'partial', 'failures', 'traces',
  ]);
  assert.equal(TRACE_BUNDLE_MIME_TYPE, 'application/vnd.quasar.trace+json;version=1');
  const canonical = stableStringifyTraceBundle(bundle);
  assert.equal(canonical, `${JSON.stringify(bundle, null, 2)}\n`);
  assert.equal(stableStringifyTraceBundle({
    traces: bundle.traces,
    failures: [],
    partial: false,
    generator: { version: '1.0.7', name: 'ignored' },
    generatedAt: bundle.generatedAt,
    version: 1,
    schema: 'quasar.trace.bundle',
  }), canonical);
  assert.equal(new Blob([canonical], { type: TRACE_BUNDLE_MIME_TYPE }).size,
    new TextEncoder().encode(canonical).byteLength);
  const artifact = createTraceBundleArtifact([trace], {
    generatedAt: '2026-07-19T12:00:00.000Z',
    generatorVersion: '1.0.7',
  });
  assert.equal(artifact.canonical, stableStringifyTraceBundle(artifact.bundle));
  assert.equal(artifact.blob.size, new TextEncoder().encode(artifact.canonical).byteLength);
  assert.ok(Object.isFrozen(artifact.bundle));
  assert.ok(Object.isFrozen(artifact.bundle.traces));
  assert.ok(Object.isFrozen(artifact.bundle.traces[0].spans[0].spanAttributes));
  assert.throws(() => { artifact.bundle.generatedAt = 'changed'; }, TypeError);
  assert.throws(() => { artifact.bundle.traces.push(trace); }, TypeError);
  assert.equal(TRACE_DOCUMENT_LIMITS.maxBundleBytes, 100 * 1024 * 1024);

  assert.throws(() => createTraceBundle([trace], {
    generatedAt: '2026-07-19T12:00:00.000Z', partial: false,
    failures: [{ traceId: TRACE_ID(2), code: 'NOT_FOUND', message: 'Not found' }],
  }), { message: 'INVALID_BUNDLE_FAILURES' });
  assert.throws(() => createTraceBundle([trace], {
    generatedAt: '2026-07-19T12:00:00.000Z', version: 2,
  }), { message: 'UNSUPPORTED_BUNDLE_VERSION' });
  assert.throws(() => createTraceBundle(Array.from({ length: 101 }, () => trace), {
    generatedAt: '2026-07-19T12:00:00.000Z',
  }), { message: 'TOO_MANY_TRACES' });

  const partial = createTraceBundle([trace], {
    generatedAt: '2026-07-19T12:00:00.000Z', partial: true,
    failures: [{ traceId: TRACE_ID(2), code: 'NOT_FOUND', message: 'Not found' }],
  });
  assert.equal(partial.partial, true);
  assert.deepEqual(partial.failures[0], {
    traceId: TRACE_ID(2), code: 'NOT_FOUND', message: 'Not found',
  });
});

test('creates canonical single-document view bytes with the 50 MiB limit', () => {
  const trace = document(TRACE_ID(1), [span(1)]);
  const normalized = normalizeTraceDocument(trace);
  const canonical = stableStringifyTraceDocument(normalized);
  const artifact = createTraceDocumentArtifact(trace);

  assert.equal(canonical, `${JSON.stringify(normalized, null, 2)}\n`);
  assert.deepEqual(artifact.document, normalized);
  assert.equal(artifact.canonical, canonical);
  assert.equal(artifact.byteSize, new TextEncoder().encode(canonical).byteLength);
  assert.equal(TRACE_DOCUMENT_LIMITS.maxDocumentBytes, 50 * 1024 * 1024);
});

test('accepts an exact 50 MiB document for a valid single-Trace Bundle', () => {
  const makeSizedTrace = (value) => document(TRACE_ID(1), [span(1, '', '1', '1', {
    spanAttributes: { payload: value },
  })]);
  const emptySize = createTraceDocumentArtifact(makeSizedTrace('')).byteSize;
  const payloadBytes = TRACE_DOCUMENT_LIMITS.maxDocumentBytes - emptySize;

  assert.throws(
    () => createTraceDocumentArtifact(makeSizedTrace('x'.repeat(payloadBytes + 1))),
    { message: 'TRACE_DOCUMENT_TOO_LARGE', code: 'TRACE_DOCUMENT_TOO_LARGE' },
  );

  const exact = createTraceDocumentArtifact(makeSizedTrace('x'.repeat(payloadBytes)));
  assert.equal(exact.byteSize, TRACE_DOCUMENT_LIMITS.maxDocumentBytes);
  const bundle = createTraceBundleArtifact([exact.document], {
    generatedAt: '2026-07-19T12:00:00.000Z',
  });
  assert.ok(bundle.blob.size <= TRACE_DOCUMENT_LIMITS.maxBundleBytes);
  assert.deepEqual(bundle.bundle.traces, [exact.document]);
});

test('enforces exact span count boundaries through production canonicalization', () => {
  const maximumTrace = normalizeTraceDocument(document(TRACE_ID(1), spans(20_000)));
  assert.equal(maximumTrace.spans.length, 20_000);
  assert.throws(
    () => normalizeTraceDocument(document(TRACE_ID(1), spans(20_001))),
    { message: 'TOO_MANY_SPANS_PER_TRACE', code: 'TOO_MANY_SPANS_PER_TRACE' },
  );

  const maximumBundle = createTraceBundle([
    document(TRACE_ID(1), spans(20_000, 1)),
    document(TRACE_ID(2), spans(20_000, 2)),
    document(TRACE_ID(3), spans(10_000, 3)),
  ], { generatedAt: '2026-07-19T12:00:00.000Z' });
  assert.equal(maximumBundle.traces.reduce((total, trace) => total + trace.spans.length, 0), 50_000);
  assert.throws(() => createTraceBundle([
    document(TRACE_ID(1), spans(20_000, 1)),
    document(TRACE_ID(2), spans(20_000, 2)),
    document(TRACE_ID(3), spans(10_001, 3)),
  ], { generatedAt: '2026-07-19T12:00:00.000Z' }), {
    message: 'TOO_MANY_SPANS_PER_BUNDLE', code: 'TOO_MANY_SPANS_PER_BUNDLE',
  });
});

test('accepts exactly 100 MiB across valid Documents and rejects one additional byte', () => {
  const options = { generatedAt: '2026-07-19T12:00:00.000Z' };
  const makeSizedTrace = (traceId, value) => document(traceId, [span(1, '', '1', '1', {
    traceId,
    spanAttributes: { payload: value },
  })]);
  const emptyCanonical = stableStringifyTraceBundle(createTraceBundle([
    makeSizedTrace(TRACE_ID(1), ''),
    makeSizedTrace(TRACE_ID(2), ''),
  ], options));
  const payloadBytes = TRACE_DOCUMENT_LIMITS.maxBundleBytes
    - new TextEncoder().encode(emptyCanonical).byteLength;
  const firstPayloadBytes = Math.floor(payloadBytes / 2);
  const secondPayloadBytes = payloadBytes - firstPayloadBytes;

  assert.throws(
    () => createTraceBundle([
      makeSizedTrace(TRACE_ID(1), 'x'.repeat(firstPayloadBytes)),
      makeSizedTrace(TRACE_ID(2), 'x'.repeat(secondPayloadBytes + 1)),
    ], options),
    { message: 'BUNDLE_TOO_LARGE', code: 'BUNDLE_TOO_LARGE' },
  );

  const exactBundle = createTraceBundle([
    makeSizedTrace(TRACE_ID(1), 'x'.repeat(firstPayloadBytes)),
    makeSizedTrace(TRACE_ID(2), 'x'.repeat(secondPayloadBytes)),
  ], options);
  const exactCanonical = stableStringifyTraceBundle(exactBundle);
  exactBundle.traces.forEach((trace) => {
    assert.ok(createTraceDocumentArtifact(trace).byteSize <= TRACE_DOCUMENT_LIMITS.maxDocumentBytes);
  });
  assert.equal(new TextEncoder().encode(exactCanonical).byteLength,
    TRACE_DOCUMENT_LIMITS.maxBundleBytes);
  assert.equal(new Blob([exactCanonical], { type: TRACE_BUNDLE_MIME_TYPE }).size,
    TRACE_DOCUMENT_LIMITS.maxBundleBytes);
});

test('worker client correlates requests and rejects pending work on dispose', async () => {
  class FakeWorker {
    listeners = new Map();
    terminated = false;
    postMessage(message) { this.lastMessage = message; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    removeEventListener(type) { this.listeners.delete(type); }
    terminate() { this.terminated = true; }
    emit(type, data) { this.listeners.get(type)?.({ data }); }
  }
  const worker = new FakeWorker();
  const workerClient = createTraceWorkerClient(worker);
  const first = workerClient.canonicalize(document(TRACE_ID(1), [span(1)]));
  assert.equal(worker.lastMessage.operation, 'canonicalize');
  worker.emit('message', { id: worker.lastMessage.id, ok: true, result: 'done' });
  assert.equal(await first, 'done');

  const pending = workerClient.canonicalize(document(TRACE_ID(2), [span(2)]));
  workerClient.dispose();
  await assert.rejects(pending, { message: 'TRACE_WORKER_DISPOSED', code: 'TRACE_WORKER_DISPOSED' });
  assert.equal(worker.terminated, true);
  assert.throws(() => workerClient.canonicalize(document(TRACE_ID(3), [span(3)])), {
    message: 'TRACE_WORKER_DISPOSED', code: 'TRACE_WORKER_DISPOSED',
  });
});

test('worker client exposes bundle work and becomes terminal after worker failure', async () => {
  class FakeWorker {
    listeners = new Map();
    terminated = false;
    postMessage(message) { this.lastMessage = message; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    removeEventListener(type) { this.listeners.delete(type); }
    terminate() { this.terminated = true; }
    emit(type, data) { this.listeners.get(type)?.({ data }); }
  }
  const worker = new FakeWorker();
  const workerClient = createTraceWorkerClient(worker);
  const bundleRequest = workerClient.createBundle(
    [document(TRACE_ID(1), [span(1)])],
    { generatedAt: '2026-07-19T12:00:00.000Z' },
  );
  assert.equal(worker.lastMessage.operation, 'createBundle');
  worker.emit('error');
  await assert.rejects(bundleRequest, { message: 'TRACE_WORKER_ERROR', code: 'TRACE_WORKER_ERROR' });
  assert.equal(worker.terminated, true);
  assert.throws(() => workerClient.canonicalize(document(TRACE_ID(2), [span(2)])), {
    message: 'TRACE_WORKER_ERROR', code: 'TRACE_WORKER_ERROR',
  });
});

test('worker client exposes document, segment and search operations', async () => {
  class FakeWorker {
    listeners = new Map();
    postMessage(message) { this.lastMessage = message; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    removeEventListener(type) { this.listeners.delete(type); }
    terminate() {}
    emit(data) { this.listeners.get('message')?.({ data }); }
  }
  const worker = new FakeWorker();
  const workerClient = createTraceWorkerClient(worker);

  const documentRequest = workerClient.createDocument(document(TRACE_ID(1), [span(1)]));
  assert.equal(worker.lastMessage.operation, 'createDocument');
  worker.emit({ id: worker.lastMessage.id, ok: true, result: { canonical: '{}' } });
  assert.deepEqual(await documentRequest, { canonical: '{}' });

  const segmentRequest = workerClient.segmentJson('{}', { wrap: true });
  assert.equal(worker.lastMessage.operation, 'segmentJson');
  worker.emit({ id: worker.lastMessage.id, ok: true, result: { segmentCount: 1 } });
  assert.deepEqual(await segmentRequest, { segmentCount: 1 });

  const searchRequest = workerClient.searchJson('{}', '{}');
  assert.equal(worker.lastMessage.operation, 'searchJson');
  worker.emit({ id: worker.lastMessage.id, ok: true, result: { offsets: [0], total: 1 } });
  assert.deepEqual(await searchRequest, { offsets: [0], total: 1 });

  const importRequest = workerClient.importTrace('{}', { byteSize: 2 });
  assert.equal(worker.lastMessage.operation, 'importTrace');
  worker.emit({ id: worker.lastMessage.id, ok: true, result: { accepted: [] } });
  assert.deepEqual(await importRequest, { accepted: [] });

  const compareRequest = workerClient.compare({ traceId: 'a' }, { traceId: 'b' });
  assert.equal(worker.lastMessage.operation, 'compare');
  worker.emit({ id: worker.lastMessage.id, ok: true, result: { rows: [] } });
  assert.deepEqual(await compareRequest, { rows: [] });
  workerClient.dispose();
});

test('worker client terminates and clears pending work when postMessage throws', async () => {
  class ThrowingWorker {
    listeners = new Map();
    terminated = false;
    postMessage() { throw new DOMException('not cloneable', 'DataCloneError'); }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    removeEventListener(type) { this.listeners.delete(type); }
    terminate() { this.terminated = true; }
  }
  const worker = new ThrowingWorker();
  const workerClient = createTraceWorkerClient(worker);
  const request = workerClient.canonicalize(document(TRACE_ID(1), [span(1)]));
  await assert.rejects(request, { message: 'TRACE_WORKER_ERROR', code: 'TRACE_WORKER_ERROR' });
  assert.equal(worker.terminated, true);
  assert.throws(() => workerClient.canonicalize(document(TRACE_ID(2), [span(2)])), {
    message: 'TRACE_WORKER_ERROR', code: 'TRACE_WORKER_ERROR',
  });
});

test('fetchTraceDocument preserves decimal strings and sends optional source', async (t) => {
  const originalAdapter = client.defaults.adapter;
  t.after(() => { client.defaults.adapter = originalAdapter; });
  const requests = [];
  client.defaults.adapter = async (config) => {
    requests.push(config);
    return {
      data: { code: 200, data: {
        traceId: TRACE_ID(1),
        startTimeUnixNano: '18446744073709551616',
        durationNano: '18446744073709551615',
        spans: [{ startTimeUnixNano: '18446744073709551616', durationNano: '10' }],
      } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };

  const live = await fetchTraceDocument(TRACE_ID(1), 'live');
  const automatic = await fetchTraceDocument(TRACE_ID(1));
  assert.equal(live.startTimeUnixNano, '18446744073709551616');
  assert.equal(live.durationNano, '18446744073709551615');
  assert.equal(live.spans[0].startTimeUnixNano, '18446744073709551616');
  assert.deepEqual(requests[0].params, { source: 'live' });
  assert.equal(requests[1].params, undefined);
  assert.equal(automatic.startTimeUnixNano, '18446744073709551616');
});
