/**
 * URL contract tests for shareable Log Search filters and correlation scope.
 *
 * @author Quasar
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeLogSearchParams, encodeLogSearchParams } from './logSearchParams.js';

test('round-trips visible log filters and trace correlation scope', () => {
  const encoded = encodeLogSearchParams({
    q: '  timeout  ',
    service: 'orders',
    severities: ['ERROR', 'WARN'],
    environment: 'production',
    namespace: 'payments',
    k8sPodName: 'orders-7f9',
    k8sNodeName: 'worker-1',
    serviceInstanceId: 'orders-1',
  }, {
    range: { from: 1000, to: 2000 },
    traceId: 'trace-1',
    spanId: 'span-1',
  });

  assert.deepEqual([...encoded.entries()], [
    ['from', '1000'],
    ['to', '2000'],
    ['traceId', 'trace-1'],
    ['spanId', 'span-1'],
    ['q', 'timeout'],
    ['service', 'orders'],
    ['severities', 'ERROR,WARN'],
    ['environment', 'production'],
    ['namespace', 'payments'],
    ['k8sPodName', 'orders-7f9'],
    ['k8sNodeName', 'worker-1'],
    ['serviceInstanceId', 'orders-1'],
  ]);
  assert.deepEqual(decodeLogSearchParams(encoded), {
    traceId: 'trace-1',
    spanId: 'span-1',
    filters: {
      q: 'timeout',
      service: 'orders',
      severities: ['ERROR', 'WARN'],
      environment: 'production',
      namespace: 'payments',
      k8sPodName: 'orders-7f9',
      k8sNodeName: 'worker-1',
      serviceInstanceId: 'orders-1',
    },
  });
});

test('reset encoding clears every log filter while preserving an explicit range', () => {
  const encoded = encodeLogSearchParams({}, { range: { from: 1000, to: 2000 } });

  assert.deepEqual([...encoded.entries()], [
    ['from', '1000'],
    ['to', '2000'],
  ]);
});

test('omits blank values and normalizes malformed severity lists', () => {
  const decoded = decodeLogSearchParams('q=%20&severities=ERROR,%20,WARN,,');
  assert.equal(decoded.filters.q, '');
  assert.deepEqual(decoded.filters.severities, ['ERROR', 'WARN']);
  assert.deepEqual([...encodeLogSearchParams({ q: ' ', severities: [] }).entries()], []);
});
