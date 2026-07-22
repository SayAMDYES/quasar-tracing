import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTraceDocument } from './traceDocument.js';
import { buildTraceComparison } from './traceCompare.js';

const TRACE_ID = (value) => value.toString(16).padStart(32, '0');
const SPAN_ID = (value) => value.toString(16).padStart(16, '0');

function span(id, parentId = '', overrides = {}) {
  return {
    traceId: overrides.traceId,
    spanId: SPAN_ID(id),
    parentSpanId: parentId,
    serviceName: 'service',
    name: 'operation',
    kind: 'Internal',
    startTimeUnixNano: '0',
    durationNano: '1000000',
    status: { code: 'Ok', message: '' },
    resourceAttributes: {},
    scope: { name: '', version: '' },
    spanAttributes: {},
    events: [],
    links: [],
    ...overrides,
  };
}

function document(traceNumber, spans) {
  const traceId = TRACE_ID(traceNumber);
  return normalizeTraceDocument({
    traceId,
    spans: spans.map((value) => ({ ...value, traceId })),
  });
}

test('aligns virtual-root trees by structural path and repeated sibling occurrence', () => {
  const baseline = document(1, [
    span(1, '', { serviceName: 'root', name: 'root' }),
    span(2, SPAN_ID(1), { startTimeUnixNano: '10', name: 'query' }),
    span(3, SPAN_ID(1), { startTimeUnixNano: '20', name: 'query' }),
    span(4, '', { startTimeUnixNano: '30', serviceName: 'worker', name: 'orphan-root' }),
  ]);
  const candidate = document(2, [
    span(90, SPAN_ID(99), { startTimeUnixNano: '20', name: 'query' }),
    span(99, '', { serviceName: 'root', name: 'root' }),
    span(80, SPAN_ID(99), { startTimeUnixNano: '10', name: 'query' }),
    span(70, '', { startTimeUnixNano: '30', serviceName: 'worker', name: 'orphan-root' }),
  ]);
  const comparison = buildTraceComparison(baseline, candidate);

  assert.equal(comparison.rows.length, 4);
  assert.ok(comparison.rows.every(({ change }) => !change.added && !change.removed));
  const repeated = comparison.rows.filter(({ signature }) => signature.name === 'query');
  assert.deepEqual(repeated.map(({ occurrence }) => occurrence), [0, 1]);
  assert.deepEqual(repeated.map(({ a, b }) => [a.spanId, b.spanId]), [
    [SPAN_ID(2), SPAN_ID(80)],
    [SPAN_ID(3), SPAN_ID(90)],
  ]);
});

test('is deterministic for shuffled orphan and parent-cycle input', () => {
  const baselineSpans = [
    span(1, SPAN_ID(2), { startTimeUnixNano: '10', name: 'cycle-a' }),
    span(2, SPAN_ID(1), { startTimeUnixNano: '20', name: 'cycle-b' }),
    span(3, SPAN_ID(9), { startTimeUnixNano: '5', name: 'orphan' }),
  ];
  const candidateSpans = baselineSpans.map((value, index) => ({
    ...value,
    spanId: SPAN_ID(index + 11),
    parentSpanId: index === 0 ? SPAN_ID(12) : index === 1 ? SPAN_ID(11) : SPAN_ID(99),
  }));
  const forward = buildTraceComparison(document(1, baselineSpans), document(2, candidateSpans));
  const reversed = buildTraceComparison(
    document(1, [...baselineSpans].reverse()),
    document(2, [...candidateSpans].reverse()),
  );

  assert.deepEqual(forward, reversed);
  assert.equal(forward.rows.length, 3);
});

test('classifies duration, self-duration, status, Attribute and Event changes', () => {
  const baseline = document(1, [
    span(1, '', { durationNano: '10000000', resourceAttributes: { region: 'a' } }),
    span(2, SPAN_ID(1), {
      durationNano: '2000000',
      status: { code: 'Ok', message: '' },
      spanAttributes: { keep: 'same', remove: 'old', change: 'before' },
      events: [{ timeUnixNano: '1', name: 'log', attributes: { value: 'a' } }],
    }),
  ]);
  const candidate = document(2, [
    span(11, '', { durationNano: '12000000', resourceAttributes: { region: 'b' } }),
    span(12, SPAN_ID(11), {
      durationNano: '4000000',
      status: { code: 'Error', message: 'boom' },
      spanAttributes: { keep: 'same', add: 'new', change: 'after' },
      events: [{ timeUnixNano: '999', name: 'log', attributes: { value: 'b' } }],
    }),
  ]);
  const comparison = buildTraceComparison(baseline, candidate);
  const child = comparison.rows.find(({ signature, depth }) => signature.name === 'operation' && depth === 1);

  assert.equal(child.duration.deltaNano, '2000000');
  assert.equal(child.duration.percent, 100);
  assert.equal(child.change.regression, true);
  assert.equal(child.change.statusChanged, true);
  assert.equal(child.change.attributesChanged, true);
  assert.equal(child.change.eventsChanged, true);
  assert.deepEqual(child.attributeDiff.span.added, [{ key: 'add', value: 'new' }]);
  assert.deepEqual(child.attributeDiff.span.removed, [{ key: 'remove', value: 'old' }]);
  assert.deepEqual(child.attributeDiff.span.changed, [{ key: 'change', before: 'before', after: 'after' }]);
  assert.equal(child.eventDiff.added.length, 1);
  assert.equal(child.eventDiff.removed.length, 1);
  assert.equal(comparison.summary.duration.delta, '2000000');
});

test('uses null percent for a zero baseline and applies both regression thresholds', () => {
  const baseline = document(1, [span(1, '', { durationNano: '0' })]);
  const candidate = document(2, [span(2, '', { durationNano: '2000000' })]);
  const zero = buildTraceComparison(baseline, candidate).rows[0];
  assert.equal(zero.duration.percent, null);
  assert.equal(zero.change.regression, false);

  const belowAbsolute = buildTraceComparison(
    document(3, [span(3, '', { durationNano: '10000000' })]),
    document(4, [span(4, '', { durationNano: '10999999' })]),
  ).rows[0];
  assert.equal(belowAbsolute.change.regression, false);

  const belowPercent = buildTraceComparison(
    document(5, [span(5, '', { durationNano: '20000000' })]),
    document(6, [span(6, '', { durationNano: '21000000' })]),
  ).rows[0];
  assert.equal(belowPercent.change.regression, false);
});

test('marks added and removed nodes without treating IDs or absolute time as changes', () => {
  const baseline = document(1, [
    span(1, '', { startTimeUnixNano: '100', name: 'root' }),
    span(2, SPAN_ID(1), { name: 'removed' }),
  ]);
  const candidate = document(2, [
    span(10, '', { startTimeUnixNano: '999999', name: 'root' }),
    span(11, SPAN_ID(10), { startTimeUnixNano: '999899', name: 'added' }),
  ]);
  const comparison = buildTraceComparison(baseline, candidate);
  const root = comparison.rows.find(({ signature }) => signature.name === 'root');

  assert.equal(root.change.changed, false);
  assert.equal(comparison.rows.find(({ signature }) => signature.name === 'removed').change.removed, true);
  assert.equal(comparison.rows.find(({ signature }) => signature.name === 'added').change.added, true);
});

test('handles the 15,000 + 15,000 Span budget and rejects one additional Span', () => {
  const largeDocument = (traceNumber, count, idOffset) => {
    const spans = [span(idOffset + 1, '', { name: 'root' })];
    for (let index = 1; index < count; index += 1) {
      spans.push(span(idOffset + index + 1, SPAN_ID(idOffset + 1), {
        name: 'child',
        startTimeUnixNano: String(index),
      }));
    }
    return document(traceNumber, spans);
  };
  const baseline = largeDocument(1, 15_000, 0);
  const candidate = largeDocument(2, 15_000, 20_000);
  const startedAt = Date.now();
  const comparison = buildTraceComparison(baseline, candidate);

  assert.equal(comparison.rows.length, 15_000);
  assert.ok(Date.now() - startedAt < 10_000);

  const overLimit = {
    ...candidate,
    spans: [...candidate.spans, span(60_000, '')],
  };
  assert.throws(() => buildTraceComparison(baseline, overLimit), {
    message: 'COMPARE_SPAN_LIMIT_EXCEEDED',
    code: 'COMPARE_SPAN_LIMIT_EXCEEDED',
  });
});
