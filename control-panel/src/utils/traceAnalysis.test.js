import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVisibleTraceRows,
  createTraceAnalysis,
  spanMatchesQuery,
} from './traceAnalysis.js';

function makeSpan(overrides = {}) {
  const durationMs = overrides.durationMs ?? 100;
  return {
    spanId: 'root',
    parentSpanId: '',
    name: 'GET /',
    service: 'api',
    timestamp: 0,
    durationMs,
    durationNs: durationMs * 1e6,
    statusCode: 'Unset',
    statusMessage: '',
    resourceAttributes: {},
    spanAttributes: {},
    events: [],
    ...overrides,
  };
}

test('treats missing parents as roots and links valid children', () => {
  const analysis = createTraceAnalysis([
    makeSpan(),
    makeSpan({ spanId: 'child', parentSpanId: 'root', timestamp: 10, durationMs: 20 }),
    makeSpan({ spanId: 'orphan', parentSpanId: 'missing', timestamp: 20, durationMs: 10 }),
  ]);

  assert.deepEqual(analysis.roots.map((span) => span.spanId), ['root', 'orphan']);
  assert.equal(analysis.childrenById.get('root')[0].spanId, 'child');

  const cycleAnalysis = createTraceAnalysis([
    makeSpan({ spanId: 'a', parentSpanId: 'b', timestamp: 30, durationMs: 40 }),
    makeSpan({ spanId: 'b', parentSpanId: 'a', timestamp: 30, durationMs: 20 }),
  ]);
  assert.deepEqual(cycleAnalysis.roots.map((span) => span.spanId), ['a']);
  assert.equal(cycleAnalysis.criticalSpanIds.has('a'), true);
  assert.equal(cycleAnalysis.criticalSpanIds.has('b'), true);

  const missingId = makeSpan({ timestamp: 40 });
  delete missingId.spanId;
  const duplicateCandidates = [
    makeSpan({ spanId: 'dup', name: 'kept', timestamp: 5, durationMs: 10 }),
    makeSpan({ spanId: 'dup', name: 'later', timestamp: 10, durationMs: 5 }),
    makeSpan({ spanId: 'dup', name: 'longer', timestamp: 5, durationMs: 20 }),
    makeSpan({ spanId: 'valid', timestamp: 20, durationMs: 5 }),
    missingId,
    makeSpan({ spanId: null, timestamp: 41 }),
    makeSpan({ spanId: '', timestamp: 42 }),
    makeSpan({ spanId: '  padded  ', timestamp: 43 }),
  ];
  const identityAnalyses = [
    createTraceAnalysis(duplicateCandidates),
    createTraceAnalysis([...duplicateCandidates].reverse()),
  ];
  assert.equal(identityAnalyses[0].byId.get('dup'), identityAnalyses[1].byId.get('dup'));
  identityAnalyses.forEach((identityAnalysis) => {
    assert.deepEqual(identityAnalysis.spans.map((span) => span.spanId), ['dup', 'valid']);
    assert.deepEqual(
      {
        name: identityAnalysis.byId.get('dup').name,
        timestamp: identityAnalysis.byId.get('dup').timestamp,
        durationMs: identityAnalysis.byId.get('dup').durationMs,
      },
      { name: 'kept', timestamp: 5, durationMs: 10 },
    );
    const identityRows = buildVisibleTraceRows(identityAnalysis, {});
    const rowIds = identityRows.rows.map((row) => row.span.spanId);
    assert.equal(identityAnalysis.spans.length, 2);
    assert.equal(identityAnalysis.byId.size, 2);
    assert.equal(identityAnalysis.parentById.size, 2);
    assert.equal(identityAnalysis.childrenById.size, 2);
    assert.equal(identityAnalysis.spanMetricsById.size, 2);
    assert.equal(identityRows.rows.length, 2);
    assert.equal(new Set(rowIds).size, rowIds.length);
    assert.equal(identityAnalysis.byId.has(''), false);
    assert.equal(identityAnalysis.byId.has('  padded  '), false);
  });

  const tieBreakCases = [
    [
      makeSpan({ spanId: 'resource-tie', resourceAttributes: { variant: 'b' } }),
      makeSpan({ spanId: 'resource-tie', resourceAttributes: { variant: 'a' } }),
      (span) => span.resourceAttributes.variant,
    ],
    [
      makeSpan({ spanId: 'attribute-tie', spanAttributes: { variant: 'b' } }),
      makeSpan({ spanId: 'attribute-tie', spanAttributes: { variant: 'a' } }),
      (span) => span.spanAttributes.variant,
    ],
    [
      makeSpan({ spanId: 'event-tie', events: [{ name: 'b' }] }),
      makeSpan({ spanId: 'event-tie', events: [{ name: 'a' }] }),
      (span) => span.events[0].name,
    ],
  ];
  tieBreakCases.forEach(([first, second, selectVariant]) => {
    const forward = createTraceAnalysis([first, second]).spans[0];
    const reversed = createTraceAnalysis([second, first]).spans[0];
    assert.equal(selectVariant(forward), 'a');
    assert.equal(selectVariant(reversed), 'a');
  });

  const collidingShape = makeSpan({
    spanId: 'signature-collision',
    spanAttributes: { a: 'x', b: 'y' },
  });
  const collidingString = makeSpan({
    spanId: 'signature-collision',
    spanAttributes: { a: 'x,"b":string:y' },
  });
  assert.equal(
    createTraceAnalysis([collidingShape, collidingString]).spans[0],
    createTraceAnalysis([collidingString, collidingShape]).spans[0],
  );
});

test('searches every supported span field case-insensitively', () => {
  const span = makeSpan({
    spanId: 'db',
    name: 'SELECT orders',
    service: 'checkout-service',
    statusCode: 'Error',
    statusMessage: 'connection timeout',
    resourceAttributes: { 'k8s.pod.name': 'checkout-7f9' },
    spanAttributes: { 'db.system': 'mysql' },
    events: [
      {
        name: 'exception',
        attributes: { 'exception.type': 'SocketTimeoutException' },
      },
    ],
  });

  for (const query of [
    'orders',
    'checkout',
    'error',
    'timeout',
    'pod.name',
    'checkout-7f9',
    'db.system',
    'mysql',
    'exception',
    'exception.type',
    'sockettimeout',
  ]) {
    assert.equal(spanMatchesQuery(span, query), true, query);
  }
  assert.equal(spanMatchesQuery(span, 'redis'), false);
});

test('filtered rows include matching ancestor paths despite collapse', () => {
  const analysis = createTraceAnalysis([
    makeSpan(),
    makeSpan({ spanId: 'branch', parentSpanId: 'root', name: 'branch', timestamp: 10, durationMs: 80 }),
    makeSpan({ spanId: 'db', parentSpanId: 'branch', name: 'SELECT orders', timestamp: 20, durationMs: 20 }),
    makeSpan({ spanId: 'other', parentSpanId: 'root', name: 'GET inventory', timestamp: 50, durationMs: 20 }),
  ]);

  const result = buildVisibleTraceRows(analysis, {
    collapsedSpanIds: new Set(['root']),
    query: 'orders',
    services: [],
    errorsOnly: false,
  });

  assert.deepEqual(result.rows.map((row) => row.span.spanId), ['root', 'branch', 'db']);
  assert.deepEqual(result.matchingSpanIds, ['db']);
  assert.deepEqual(result.rows.filter((row) => row.isMatch).map((row) => row.span.spanId), ['db']);

  const deepSpans = Array.from({ length: 2_000 }, (_, index) => makeSpan({
    spanId: `match-${index}`,
    parentSpanId: index === 0 ? '' : `match-${index - 1}`,
    name: `orders ${index}`,
    timestamp: index,
    durationMs: 2_000 - index,
  }));
  const deepResult = buildVisibleTraceRows(createTraceAnalysis(deepSpans), {
    collapsedSpanIds: new Set(['match-0']),
    query: 'orders',
    services: [],
    errorsOnly: false,
  });
  assert.equal(deepResult.rows.length, 2_000);
  assert.equal(deepResult.matchingSpanIds.length, 2_000);
});

test('builds a last-finishing-child critical path', () => {
  const analysis = createTraceAnalysis([
    makeSpan(),
    makeSpan({ spanId: 'first', parentSpanId: 'root', timestamp: 10, durationMs: 20 }),
    makeSpan({ spanId: 'last', parentSpanId: 'root', timestamp: 40, durationMs: 50 }),
  ]);

  assert.deepEqual([...analysis.criticalSpanIds].sort(), ['first', 'last', 'root']);
  assert.equal(
    analysis.criticalSections.reduce((total, section) => total + section.durationMs, 0),
    100,
  );
  assert.equal(
    analysis.criticalSections.every(
      (section) => section.startTime === section.start && section.endTime === section.end,
    ),
    true,
  );

  const overlappingRoots = createTraceAnalysis([
    makeSpan({ spanId: 'overlap-a' }),
    makeSpan({ spanId: 'overlap-b' }),
  ]);
  assert.deepEqual([...overlappingRoots.criticalSpanIds], ['overlap-a']);
  assert.equal(
    overlappingRoots.criticalSections.reduce((total, section) => total + section.durationMs, 0),
    100,
  );

  const sequentialRoots = createTraceAnalysis([
    makeSpan({ spanId: 'early-root', durationMs: 40 }),
    makeSpan({ spanId: 'late-root', timestamp: 40, durationMs: 60 }),
  ]);
  assert.deepEqual([...sequentialRoots.criticalSpanIds].sort(), ['early-root', 'late-root']);
  assert.equal(
    sequentialRoots.criticalSections.reduce((total, section) => total + section.durationMs, 0),
    100,
  );

  const deepSpans = Array.from({ length: 5_000 }, (_, index) => makeSpan({
    spanId: `deep-${index}`,
    parentSpanId: index === 0 ? '' : `deep-${index - 1}`,
    name: `deep-${index}`,
    timestamp: index,
    durationMs: 5_000 - index,
    statusCode: 'Error',
  }));
  const deepAnalysis = createTraceAnalysis(deepSpans);
  assert.equal(deepAnalysis.criticalSpanIds.has('deep-4999'), true);
  assert.equal(deepAnalysis.errorSpans.length, 5_000);
  const lastError = deepAnalysis.errorSpans.at(-1);
  const pathDescriptor = Object.getOwnPropertyDescriptor(lastError, 'path');
  assert.equal(typeof pathDescriptor.get, 'function');
  assert.equal('value' in pathDescriptor, false);
  const lastErrorPath = lastError.path;
  assert.equal(lastErrorPath.length, 5_000);
  assert.equal(lastErrorPath[0], 'deep-0');
  assert.equal(lastErrorPath.at(-1), 'deep-4999');

  const wideSpans = Array.from({ length: 2_000 }, (_, index) => makeSpan({
    spanId: `wide-${index}`,
    parentSpanId: 'wide-root',
    timestamp: index,
    durationMs: 1,
  }));
  const wideAnalysis = createTraceAnalysis([
    makeSpan({ spanId: 'wide-root', durationMs: 2_000 }),
    ...wideSpans,
  ]);
  assert.equal(wideAnalysis.criticalSpanIds.size, 2_000);
  assert.equal(
    wideAnalysis.criticalSections.reduce((total, section) => total + section.durationMs, 0),
    2_000,
  );
});

test('clips overflowing critical sections to their parent', () => {
  const analysis = createTraceAnalysis([
    makeSpan(),
    makeSpan({ spanId: 'child', parentSpanId: 'root', timestamp: 90, durationMs: 30 }),
  ]);

  assert.equal(
    analysis.criticalSections.reduce((total, section) => total + section.durationMs, 0),
    100,
  );
  assert.equal(
    analysis.criticalSections.every((section) => section.start >= 0 && section.end <= 100),
    true,
  );
});

test('subtracts the union of overlapping direct children from self time', () => {
  const analysis = createTraceAnalysis([
    makeSpan(),
    makeSpan({ spanId: 'first', parentSpanId: 'root', timestamp: 10, durationMs: 40 }),
    makeSpan({ spanId: 'second', parentSpanId: 'root', timestamp: 30, durationMs: 40 }),
  ]);

  assert.equal(analysis.spanMetricsById.get('root').selfDurationMs, 40);
});

test('aggregates service and operation metrics with critical and error counts', () => {
  const analysis = createTraceAnalysis([
    makeSpan({ name: 'POST /orders' }),
    makeSpan({
      spanId: 'db',
      parentSpanId: 'root',
      name: 'INSERT',
      service: 'db',
      timestamp: 20,
      durationMs: 60,
      statusCode: 'Error',
    }),
  ]);

  const dbService = analysis.serviceStats.find((row) => row.service === 'db');
  assert.deepEqual(
    {
      spanCount: dbService.spanCount,
      errorCount: dbService.errorCount,
      totalDurationMs: dbService.totalDurationMs,
    },
    { spanCount: 1, errorCount: 1, totalDurationMs: 60 },
  );

  const dbOperation = analysis.operationStats.find(
    (row) => row.service === 'db' && row.operation === 'INSERT',
  );
  assert.equal(dbOperation.criticalSpanCount, 1);
});
