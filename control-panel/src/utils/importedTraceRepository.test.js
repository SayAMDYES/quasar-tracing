import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRandomSessionId,
  createImportedTraceRepository,
  traceDocumentToDetail,
} from './importedTraceRepository.js';

const TRACE_ID = '00000000000000000000000000000001';
const document = {
  traceId: TRACE_ID,
  startTimeUnixNano: '1700000000000000000',
  durationNano: '2000000',
  root: {
    spanId: '0000000000000001',
    serviceName: 'orders',
    name: 'GET /orders',
    selection: 'natural',
  },
  services: ['orders'],
  warnings: [],
  spans: [{
    traceId: TRACE_ID,
    spanId: '0000000000000001',
    parentSpanId: '',
    traceState: '',
    serviceName: 'orders',
    name: 'GET /orders',
    kind: 'Server',
    startTimeUnixNano: '1700000000000000000',
    durationNano: '2000000',
    status: { code: 'Error', message: 'boom' },
    resourceAttributes: {
      'deployment.environment.name': 'test',
      'service.instance.id': 'orders-1',
      'k8s.namespace.name': 'default',
    },
    scope: { name: '', version: '' },
    spanAttributes: {},
    events: [{ timeUnixNano: '1700000000001000000', name: 'exception', attributes: {} }],
    links: [],
  }],
};

test('keeps imported sessions in memory without browser storage access', () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('localStorage accessed'); } });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: () => { throw new Error('sessionStorage accessed'); } });
  try {
    const repository = createImportedTraceRepository(() => 'session-1');
    const sessionId = repository.add({ accepted: [document], rejected: [], warnings: [] }, {
      fileName: 'trace.json',
    });
    const session = repository.getSession(sessionId);

    assert.equal(sessionId, 'session-1');
    assert.equal(session.primaryTraceId, TRACE_ID);
    assert.equal(repository.getTrace(sessionId, TRACE_ID), document);
    assert.equal(session.fileName, 'trace.json');
    repository.remove(sessionId);
    assert.equal(repository.getSession(sessionId), null);
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalLocalStorage });
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
    else Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: originalSessionStorage });
  }
});

test('adapts a normalized Document to the existing Trace Detail presentation', () => {
  const detail = traceDocumentToDetail(document);

  assert.equal(detail.summary.traceId, TRACE_ID);
  assert.equal(detail.summary.startTime, 1_700_000_000_000);
  assert.equal(detail.summary.durationNs, '2000000');
  assert.equal(detail.summary.status, 'Error');
  assert.equal(detail.summary.errorCount, 1);
  assert.equal(detail.summary.environment, 'test');
  assert.equal(detail.spans[0].service, 'orders');
  assert.equal(detail.spans[0].timestamp, 1_700_000_000_000);
  assert.equal(detail.spans[0].durationNs, '2000000');
  assert.equal(detail.spans[0].events[0].timestamp, 1_700_000_000_001);
});

test('rejects empty sessions and duplicate session IDs', () => {
  const repository = createImportedTraceRepository(() => 'fixed');
  assert.throws(() => repository.add({ accepted: [] }), { message: 'NO_IMPORTED_TRACES' });
  repository.add({ accepted: [document] });
  assert.throws(() => repository.add({ accepted: [document] }), { message: 'DUPLICATE_IMPORT_SESSION_ID' });
});

test('uses cryptographic session IDs and rejects unavailable secure randomness', () => {
  const bytesId = createRandomSessionId({
    getRandomValues(bytes) {
      bytes.forEach((_, index) => { bytes[index] = index; });
      return bytes;
    },
  });
  assert.equal(bytesId, '000102030405060708090a0b0c0d0e0f');
  assert.equal(createRandomSessionId({ randomUUID: () => 'secure-uuid' }), 'secure-uuid');
  assert.throws(() => createRandomSessionId({}), { message: 'CRYPTO_UNAVAILABLE' });
});
