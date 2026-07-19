import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeTraceSearchParams,
  encodeTraceSearchParams,
  normalizeAttributeConditions,
  toTraceSearchRequest,
} from './traceSearchParams.js';

function assertInvalid(conditions) {
  const result = normalizeAttributeConditions(conditions);
  assert.equal(result.errors.length > 0, true);
  return result;
}

test('round-trips special characters and Chinese text while normalizing condition fields', () => {
  const filters = {
    q: '订单 + checkout &=?',
    attributeConditions: [
      {
        scope: ' RESOURCE ',
        key: ' http.route/中文 ',
        operator: ' EQUALS ',
        value: ' /订单?a=1&b=two + % "quoted" ',
      },
    ],
  };

  const encoded = encodeTraceSearchParams(filters);
  const decoded = decodeTraceSearchParams(encoded);

  assert.equal(decoded.attributeError, null);
  assert.equal(decoded.filters.q, filters.q);
  assert.deepEqual(decoded.filters.attributeConditions, [
    {
      scope: 'resource',
      key: 'http.route/中文',
      operator: 'equals',
      value: ' /订单?a=1&b=two + % "quoted" ',
    },
  ]);
});

test('reports malformed, non-array, oversized, and over-limit attribute payloads', () => {
  for (const raw of ['', ' \t\r\n']) {
    const decoded = decodeTraceSearchParams(new URLSearchParams({ attributes: raw }));
    assert.equal(decoded.attributeError, null);
    assert.deepEqual(decoded.filters.attributeConditions, []);
  }

  for (const raw of ['[{', '{"scope":"span"}', 'null']) {
    const decoded = decodeTraceSearchParams(new URLSearchParams({ attributes: raw }));
    assert.equal(typeof decoded.attributeError, 'string');
    assert.equal(decoded.filters.attributeConditions.length, 0);
  }

  const oversized = decodeTraceSearchParams(
    new URLSearchParams({ attributes: 'x'.repeat(4097) }),
  );
  assert.match(oversized.attributeError, /4096/);

  const oversizedBlank = decodeTraceSearchParams(
    new URLSearchParams({ attributes: ' '.repeat(4097) }),
  );
  assert.match(oversizedBlank.attributeError, /4096/);
  assert.deepEqual(oversizedBlank.filters.attributeConditions, []);

  const sixConditions = Array.from({ length: 6 }, (_, index) => ({
    scope: 'span',
    key: `key.${index}`,
    operator: 'exists',
  }));
  const overLimit = normalizeAttributeConditions(sixConditions);
  assert.match(overLimit.errors.join(' '), /5/);
});

test('rejects null, non-object, unknown fields, scopes, and operators', () => {
  assertInvalid([null]);
  assertInvalid(['not-an-object']);
  assertInvalid([{ scope: 'span', key: 'db.system', operator: 'exists', typo: true }]);
  assertInvalid([{ scope: 'log', key: 'db.system', operator: 'exists' }]);
  assertInvalid([{ scope: 'span', key: 'db.system', operator: 'matches' }]);
});

test('validates attribute key type and length after trimming', () => {
  assertInvalid([{ scope: 'span', key: '   ', operator: 'exists' }]);
  assertInvalid([{ scope: 'span', key: 42, operator: 'exists' }]);
  assertInvalid([{ scope: 'span', key: 'k'.repeat(129), operator: 'exists' }]);

  const boundary = normalizeAttributeConditions([
    { scope: 'span', key: 'k'.repeat(128), operator: 'exists' },
  ]);
  assert.deepEqual(boundary.errors, []);
});

test('validates equals and contains values without trimming them', () => {
  for (const operator of ['equals', 'contains']) {
    assertInvalid([{ scope: 'span', key: 'db.system', operator }]);
    assertInvalid([{ scope: 'span', key: 'db.system', operator, value: null }]);
    assertInvalid([{ scope: 'span', key: 'db.system', operator, value: 42 }]);
    assertInvalid([{
      scope: 'span',
      key: 'db.system',
      operator,
      value: 'v'.repeat(513),
    }]);

    const boundary = normalizeAttributeConditions([{
      scope: 'span',
      key: 'db.system',
      operator,
      value: ` ${'v'.repeat(510)} `,
    }]);
    assert.deepEqual(boundary.errors, []);
    assert.equal(boundary.conditions[0].value.length, 512);
    assert.equal(boundary.conditions[0].value.startsWith(' '), true);
    assert.equal(boundary.conditions[0].value.endsWith(' '), true);
  }
});

test('normalizes empty exists values to null and rejects non-empty values', () => {
  const result = normalizeAttributeConditions([
    { scope: 'span', key: 'error.type', operator: 'exists' },
    { scope: 'span', key: 'exception.type', operator: 'exists', value: null },
    { scope: 'resource', key: 'service.version', operator: 'exists', value: '' },
  ]);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.conditions.map((condition) => condition.value), [null, null, null]);
  assertInvalid([{ scope: 'span', key: 'error.type', operator: 'exists', value: ' ' }]);
  assertInvalid([{ scope: 'span', key: 'error.type', operator: 'exists', value: 1 }]);
});

test('rejects duplicate conditions after normalization', () => {
  const result = normalizeAttributeConditions([
    { scope: ' SPAN ', key: ' error.type ', operator: ' EXISTS ', value: '' },
    { scope: 'span', key: 'error.type', operator: 'exists' },
  ]);

  assert.match(result.errors.join(' '), /duplicate/i);
});

test('round-trips all fixed filters and omits empty values and status all', () => {
  const filters = {
    service: 'checkout + api',
    operation: 'POST /订单?confirm=true',
    spanService: undefined,
    spanOperation: undefined,
    spanStatus: undefined,
    environment: 'prod',
    namespace: 'quasar-ns',
    k8sPodName: 'checkout-7f8c9',
    k8sNodeName: 'node-a',
    serviceInstanceId: 'instance&1',
    status: 'error',
    minDurationMs: 0,
    maxDurationMs: 125.5,
    q: '支付 + timeout',
    attributeConditions: [],
  };

  const decoded = decodeTraceSearchParams(encodeTraceSearchParams(filters));
  assert.equal(decoded.attributeError, null);
  assert.deepEqual(decoded.filters, filters);

  const empty = encodeTraceSearchParams({
    service: '',
    operation: undefined,
    environment: null,
    status: 'all',
    q: '',
    attributeConditions: [],
  });
  assert.equal(empty.toString(), '');
});

test('round-trips same-span selectors and keeps root operation and status independent', () => {
  const filters = {
    service: 'root-service',
    operation: 'root-operation',
    spanService: 'selected-span-service',
    spanOperation: 'selected-span-operation',
    spanStatus: 'error',
    status: 'ok',
    q: '',
    attributeConditions: [],
  };

  const encoded = encodeTraceSearchParams(filters);
  assert.deepEqual([...encoded.entries()], [
    ['service', 'root-service'],
    ['operation', 'root-operation'],
    ['spanService', 'selected-span-service'],
    ['spanOperation', 'selected-span-operation'],
    ['spanStatus', 'error'],
    ['status', 'ok'],
  ]);

  const decoded = decodeTraceSearchParams(encoded);
  assert.equal(decoded.filters.operation, 'root-operation');
  assert.equal(decoded.filters.status, 'ok');
  assert.equal(decoded.filters.spanService, 'selected-span-service');
  assert.equal(decoded.filters.spanOperation, 'selected-span-operation');
  assert.equal(decoded.filters.spanStatus, 'error');
  assert.deepEqual(toTraceSearchRequest(decoded.filters), {
    service: 'root-service',
    operation: 'root-operation',
    spanService: 'selected-span-service',
    spanOperation: 'selected-span-operation',
    spanStatus: 'error',
    status: 'ok',
  });

  assert.equal(encodeTraceSearchParams({
    spanService: '',
    spanOperation: undefined,
    spanStatus: null,
    attributeConditions: [],
  }).toString(), '');
});

test('keeps fixed filters visible when attributes are invalid so callers can block the request', () => {
  const decoded = decodeTraceSearchParams(new URLSearchParams({
    service: 'checkout',
    status: 'error',
    attributes: '[{"scope":"log"}]',
  }));

  assert.equal(decoded.filters.service, 'checkout');
  assert.equal(decoded.filters.status, 'error');
  assert.deepEqual(decoded.filters.attributeConditions, []);
  assert.equal(typeof decoded.attributeError, 'string');
});

test('builds compact trace requests and serializes attributes through one field', () => {
  const empty = toTraceSearchRequest({
    service: '',
    status: 'all',
    q: '   ',
    attributeConditions: [],
  });
  assert.deepEqual(empty, {});
  assert.equal('attributes' in empty, false);

  const request = toTraceSearchRequest({
    service: 'checkout',
    status: 'error',
    q: '  timeout  ',
    attributeConditions: [
      { scope: ' SPAN ', key: ' db.system ', operator: ' EQUALS ', value: ' mysql ' },
    ],
  });
  assert.deepEqual(request, {
    service: 'checkout',
    status: 'error',
    q: 'timeout',
    attributes: JSON.stringify([
      { scope: 'span', key: 'db.system', operator: 'equals', value: ' mysql ' },
    ]),
  });
  assert.equal('attributeConditions' in request, false);
});

test('rejects invalid attributes instead of building a wider request', () => {
  assert.throws(
    () => toTraceSearchRequest({
      service: 'checkout',
      attributeConditions: [
        { scope: 'log', key: 'error.type', operator: 'exists' },
      ],
    }),
    {
      name: 'Error',
      message: 'Invalid attribute conditions: Attribute condition 1 scope must be resource or span',
    },
  );
});
