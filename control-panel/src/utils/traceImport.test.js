import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TRACE_DOCUMENT_LIMITS,
  createTraceBundle,
  stableStringifyTraceBundle,
} from './traceDocument.js';
import {
  convertJaegerTrace,
  parseTraceImportFile,
  parseTraceImportText,
} from './traceImport.js';

const TRACE_ID = (value) => value.toString(16).padStart(32, '0');
const SPAN_ID = (value) => value.toString(16).padStart(16, '0');

function jaegerSpan(overrides = {}) {
  return {
    traceID: 'abcdef0123456789',
    spanID: '1',
    operationName: ' GET /orders ',
    references: [],
    startTime: '1844674407370955',
    duration: 25,
    tags: [],
    logs: [],
    processID: 'p1',
    warnings: [],
    ...overrides,
  };
}

function jaegerTrace(overrides = {}) {
  return {
    traceID: 'abcdef0123456789',
    spans: [jaegerSpan()],
    processes: { p1: { serviceName: 'orders', tags: [] } },
    warnings: [],
    ...overrides,
  };
}

function document(traceId, spanCount = 1, payload = null) {
  return {
    traceId,
    spans: Array.from({ length: spanCount }, (_, index) => ({
      traceId,
      spanId: SPAN_ID(index + 1),
      parentSpanId: '',
      serviceName: 'service',
      name: `span-${index + 1}`,
      startTimeUnixNano: String(index),
      durationNano: '1',
      spanAttributes: index === 0 && payload !== null ? { payload } : {},
    })),
  };
}

function stringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

test('accepts every supported Jaeger Query JSON wrapper', () => {
  const trace = jaegerTrace();
  const wrappers = [trace, [trace], { data: trace }, { data: [trace] }];
  wrappers.forEach((wrapper) => {
    const result = parseTraceImportText(stringify(wrapper));
    assert.equal(result.accepted.length, 1);
    assert.equal(result.rejected.length, 0);
    assert.equal(result.accepted[0].traceId, '0000000000000000abcdef0123456789');
  });
});

test('accepts canonical Quasar v1 and rejects invalid Bundle state', () => {
  const bundle = createTraceBundle([document(TRACE_ID(1))], {
    generatedAt: '2026-07-19T12:00:00.000Z',
  });
  assert.equal(parseTraceImportText(stableStringifyTraceBundle(bundle)).accepted.length, 1);

  const invalidCases = [
    [{ ...bundle, version: 2 }, 'UNSUPPORTED_BUNDLE_VERSION'],
    [{ ...bundle, partial: true }, 'PARTIAL_BUNDLE_NOT_IMPORTABLE'],
    [{ ...bundle, failures: [{ traceId: TRACE_ID(2), code: 'NOT_FOUND', message: 'missing' }] }, 'INVALID_BUNDLE_FAILURES'],
  ];
  invalidCases.forEach(([input, code]) => {
    const result = parseTraceImportText(stringify(input));
    assert.deepEqual(result.rejected.map((item) => item.code), [code]);
    assert.equal(result.accepted.length, 0);
  });
});

test('rejects unsupported payload families, JSONL and summary-only input', () => {
  const cases = [
    [{ resourceSpans: [] }, 'UNSUPPORTED_OTLP_JSON'],
    [[{ traceId: TRACE_ID(1), id: SPAN_ID(1), timestamp: 1 }], 'UNSUPPORTED_ZIPKIN_JSON'],
    [{ traceId: TRACE_ID(1), rootService: 'orders' }, 'TRACE_HAS_NO_SPANS'],
    ['{"traceID":"a"}\n{"traceID":"b"}\n', 'UNSUPPORTED_JSONL'],
  ];
  cases.forEach(([input, code]) => {
    const result = parseTraceImportText(typeof input === 'string' ? input : stringify(input));
    assert.deepEqual(result.rejected.map((item) => item.code), [code]);
  });
});

test('normalizes IDs and deterministically selects parent references and links', () => {
  const outerId = '0000000000000000abcdef0123456789';
  const trace = jaegerTrace({
    traceID: outerId,
    spans: [
      jaegerSpan({ traceID: 'abcdef0123456789', spanID: 'a' }),
      jaegerSpan({
        traceID: outerId.toUpperCase(),
        spanID: 'B',
        operationName: 'child',
        references: [
          { refType: 'FOLLOWS_FROM', traceID: 'abcdef0123456789', spanID: 'a' },
          { refType: 'CHILD_OF', traceID: outerId, spanID: 'c' },
          { refType: 'CHILD_OF', traceID: TRACE_ID(9), spanID: 'd' },
        ],
      }),
    ],
  });
  const converted = convertJaegerTrace(trace, '$');
  const child = converted.spans.find(({ spanId }) => spanId === SPAN_ID(11));

  assert.equal(child.parentSpanId, SPAN_ID(12));
  assert.deepEqual(child.links, [
    { traceId: outerId, spanId: SPAN_ID(10), traceState: '', attributes: { 'jaeger.ref_type': 'FOLLOWS_FROM' } },
    { traceId: TRACE_ID(9), spanId: SPAN_ID(13), traceState: '', attributes: { 'jaeger.ref_type': 'CHILD_OF' } },
  ]);
  assert.ok(converted.warnings.some(({ code, spanId }) => (
    code === 'MULTIPLE_PARENT_REFERENCES' && spanId === SPAN_ID(11)
  )));
});

test('rejects Jaeger ID and reference conflicts with stable paths', () => {
  const cases = [
    [jaegerTrace({ traceID: 'bad' }), 'INVALID_TRACE_ID'],
    [jaegerTrace({ spans: [jaegerSpan({ traceID: TRACE_ID(2) })] }), 'TRACE_ID_CONFLICT'],
    [jaegerTrace({ spans: [jaegerSpan({ spanID: '1' }), jaegerSpan({ spanID: '01' })] }), 'DUPLICATE_SPAN_ID'],
    [jaegerTrace({ spans: [jaegerSpan({ references: [{ refType: 'CHILD_OF', traceID: 'bad', spanID: '1' }] })] }), 'INVALID_REFERENCE_TRACE_ID'],
    [jaegerTrace({ spans: [jaegerSpan({ references: [{ refType: 'OTHER', traceID: 'abcdef0123456789', spanID: '1' }] })] }), 'UNSUPPORTED_REFERENCE_TYPE'],
  ];
  cases.forEach(([input, code]) => {
    assert.throws(() => convertJaegerTrace(input, '$.data[0]'), (error) => (
      error.code === code && error.path.startsWith('$.data[0]')
    ));
  });
});

test('maps process, scope, times, kind, status, logs and warnings', () => {
  const trace = jaegerTrace({
    futureField: 'ignored',
    warnings: ['trace warning'],
    processes: {
      p1: {
        serviceName: 'orders',
        tags: [
          { key: 'service.name', type: 'string', value: 'orders' },
          { key: 'region', value: 'cn-south' },
        ],
        extra: true,
      },
    },
    spans: [jaegerSpan({
      tags: [
        { key: 'otel.library.name', value: 'orders-lib' },
        { key: 'otel.library.version', value: '1.2.3' },
        { key: 'span.kind', value: 'SERVER' },
        { key: 'otel.status_code', value: 'ok' },
        { key: 'error', type: 'bool', value: true },
        { key: 'error.message', value: 'boom' },
        { key: 'attempt', type: 'int64', value: '0002' },
        { key: 'ratio', type: 'float64', value: 1.25 },
        { key: 'encoded', type: 'binary', value: 'YQ==' },
        { key: 'nullable', value: null },
      ],
      logs: [{
        timestamp: 1844674407370955,
        fields: [
          { key: 'event', value: 'exception' },
          { key: 'message', value: 'boom' },
        ],
        unknown: 'ignored',
      }],
      warnings: ['span warning'],
      unknownSpanField: true,
    })],
  });
  const converted = convertJaegerTrace(trace, '$');
  const span = converted.spans[0];

  assert.equal(span.startTimeUnixNano, '1844674407370955000');
  assert.equal(span.durationNano, '25000');
  assert.equal(span.name, 'GET /orders');
  assert.equal(span.serviceName, 'orders');
  assert.equal(span.kind, 'Server');
  assert.deepEqual(span.scope, { name: 'orders-lib', version: '1.2.3' });
  assert.deepEqual(span.status, { code: 'Error', message: 'boom' });
  assert.deepEqual(span.resourceAttributes, { region: 'cn-south', 'service.name': 'orders' });
  assert.equal(span.spanAttributes.attempt, '2');
  assert.equal(span.spanAttributes.ratio, '1.25');
  assert.deepEqual(span.events[0], {
    timeUnixNano: '1844674407370955000',
    name: 'exception',
    attributes: { event: 'exception', message: 'boom' },
  });
  assert.ok(converted.warnings.some(({ code }) => code === 'STATUS_CONFLICT'));
  assert.ok(converted.warnings.some(({ code }) => code === 'NULL_TAG_IGNORED'));
  assert.ok(converted.warnings.some(({ code, spanId }) => code === 'JAEGER_WARNING' && spanId === SPAN_ID(1)));
  assert.ok(converted.warnings.some(({ code, message }) => code === 'UNKNOWN_FIELD_IGNORED' && message.includes('unknownSpanField')));
});

test('uses missing-process fallbacks and canonical topology rules', () => {
  const trace = jaegerTrace({
    spans: [
      jaegerSpan({ spanID: '2', processID: 'missing', startTime: 20, duration: 2 }),
      jaegerSpan({ spanID: '1', processID: null, startTime: 10, duration: 30 }),
    ],
  });
  const converted = convertJaegerTrace(trace, '$');

  assert.equal(converted.startTimeUnixNano, '10000');
  assert.equal(converted.durationNano, '30000');
  assert.equal(converted.root.spanId, SPAN_ID(1));
  assert.ok(converted.spans.every(({ serviceName }) => serviceName === 'unknown-service'));
  assert.ok(converted.warnings.some(({ code }) => code === 'MISSING_PROCESS'));
  assert.ok(converted.warnings.some(({ code }) => code === 'MULTIPLE_ROOTS'));
});

test('validates tag types, duplicate keys, service names and times', () => {
  const cases = [
    [jaegerTrace({ spans: [jaegerSpan({ startTime: -1 })] }), 'INVALID_SPAN_TIME'],
    [jaegerTrace({ spans: [jaegerSpan({ operationName: '  ' })] }), 'MISSING_OPERATION_NAME'],
    [jaegerTrace({ spans: [jaegerSpan({ tags: [{ key: 'x', type: 'unknown', value: 'a' }] })] }), 'UNSUPPORTED_TAG_TYPE'],
    [jaegerTrace({ spans: [jaegerSpan({ tags: [{ key: 'x', type: 'bool', value: 'true' }] })] }), 'TAG_TYPE_VALUE_CONFLICT'],
    [jaegerTrace({ spans: [jaegerSpan({ tags: [{ key: 'x', value: [] }] })] }), 'UNSUPPORTED_TAG_VALUE'],
    [jaegerTrace({ spans: [jaegerSpan({ tags: [{ key: 'x', value: 1 }, { key: 'x', value: 2 }] })] }), 'DUPLICATE_TAG_CONFLICT'],
    [jaegerTrace({ processes: { p1: { serviceName: 'orders', tags: [{ key: 'service.name', value: 'other' }] } } }), 'SERVICE_NAME_CONFLICT'],
    [jaegerTrace({ spans: [jaegerSpan({ logs: [{ timestamp: 'bad', fields: [] }] })] }), 'INVALID_LOG_TIME'],
  ];
  cases.forEach(([input, code]) => assert.throws(
    () => convertJaegerTrace(input, '$'),
    { code },
  ));
});

test('deduplicates equal tags, preserves unknown kind and rejects later duplicate Trace IDs', () => {
  const first = jaegerTrace({ spans: [jaegerSpan({ tags: [
    { key: 'x', value: 1 },
    { key: 'x', type: 'int64', value: '1' },
    { key: 'span.kind', value: 'future-kind' },
  ] })] });
  const result = parseTraceImportText(stringify([first, first]));

  assert.equal(result.accepted.length, 1);
  assert.deepEqual(result.rejected.map(({ code }) => code), ['DUPLICATE_TRACE_ID']);
  assert.equal(result.accepted[0].spans[0].kind, 'Internal');
  assert.equal(result.accepted[0].spans[0].spanAttributes['span.kind'], 'future-kind');
  assert.ok(result.accepted[0].warnings.some(({ code }) => code === 'DUPLICATE_TAG'));
  assert.ok(result.accepted[0].warnings.some(({ code }) => code === 'UNKNOWN_SPAN_KIND'));
});

test('checks file type, UTF-8 and byte size before parsing', async () => {
  const json = new TextEncoder().encode(stringify(jaegerTrace()));
  const file = (name, bytes, size = bytes.byteLength) => ({
    name,
    size,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });

  assert.equal((await parseTraceImportFile(file('trace.json', json))).accepted.length, 1);
  assert.deepEqual((await parseTraceImportFile(file('trace.zip', json))).rejected.map(({ code }) => code), ['UNSUPPORTED_FILE_TYPE']);
  assert.deepEqual((await parseTraceImportFile(file('trace.json', Uint8Array.from([0xC3, 0x28])))).rejected.map(({ code }) => code), ['INVALID_UTF8']);
  assert.deepEqual((await parseTraceImportFile(file(
    'trace.json', json, TRACE_DOCUMENT_LIMITS.maxBundleBytes + 1,
  ))).rejected.map(({ code }) => code), ['IMPORT_FILE_TOO_LARGE']);
});

test('round-trips the maximum 100 Trace and 50,000 Span batch', () => {
  const traces = Array.from({ length: 100 }, (_, index) => document(TRACE_ID(index + 1), 500));
  const options = { generatedAt: '2026-07-19T12:00:00.000Z' };
  const source = createTraceBundle(traces, options);
  const imported = parseTraceImportText(stableStringifyTraceBundle(source));
  const reexported = createTraceBundle(imported.accepted, options);

  assert.equal(imported.rejected.length, 0);
  assert.equal(imported.accepted.length, 100);
  assert.equal(imported.accepted.reduce((total, trace) => total + trace.spans.length, 0), 50_000);
  assert.deepEqual(reexported.traces, source.traces);
});

test('round-trips an exact 100 MiB non-partial Bundle', () => {
  const options = { generatedAt: '2026-07-19T12:00:00.000Z' };
  const makeBundle = (first, second) => createTraceBundle([
    document(TRACE_ID(1), 1, first),
    document(TRACE_ID(2), 1, second),
  ], options);
  const empty = stableStringifyTraceBundle(makeBundle('', ''));
  const payloadBytes = TRACE_DOCUMENT_LIMITS.maxBundleBytes - new TextEncoder().encode(empty).byteLength;
  const firstPayloadBytes = Math.floor(payloadBytes / 2);
  const secondPayloadBytes = payloadBytes - firstPayloadBytes;
  const source = makeBundle('x'.repeat(firstPayloadBytes), 'x'.repeat(secondPayloadBytes));
  const canonical = stableStringifyTraceBundle(source);
  const imported = parseTraceImportText(canonical, { byteSize: TRACE_DOCUMENT_LIMITS.maxBundleBytes });
  const reexported = createTraceBundle(imported.accepted, options);

  assert.equal(imported.rejected.length, 0);
  assert.deepEqual(reexported.traces, source.traces);
});

test('rejects count limits without partial Span acceptance', () => {
  const tooManyTraces = Array.from({ length: 101 }, (_, index) => jaegerTrace({
    traceID: TRACE_ID(index + 1),
    spans: [jaegerSpan({ traceID: TRACE_ID(index + 1) })],
  }));
  assert.deepEqual(
    parseTraceImportText(stringify(tooManyTraces)).rejected.map(({ code }) => code),
    ['TOO_MANY_TRACES'],
  );

  const tooManySpans = jaegerTrace({
    spans: Array.from({ length: TRACE_DOCUMENT_LIMITS.maxSpansPerTrace + 1 }, (_, index) => (
      jaegerSpan({ spanID: (index + 1).toString(16) })
    )),
  });
  assert.deepEqual(
    parseTraceImportText(stringify(tooManySpans)).rejected.map(({ code }) => code),
    ['TOO_MANY_SPANS_PER_TRACE'],
  );
});
