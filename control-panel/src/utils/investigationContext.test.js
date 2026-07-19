import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInvestigationPath,
  buildTraceAttributeSearchPath,
  clampInvestigationRange,
  parseInvestigationRange,
  readInvestigationRange,
  spanInvestigationContext,
  traceInvestigationWindow,
} from './investigationContext.js';

test('builds a five-minute investigation window around a two-second trace', () => {
  assert.deepEqual(
    traceInvestigationWindow(
      { startTime: 1_000_000, durationNs: 2_000_000_000 },
      2_000_000,
    ),
    { from: 700_000, to: 1_302_000 },
  );
});

test('clamps an investigation window that extends into the future', () => {
  assert.deepEqual(
    traceInvestigationWindow(
      { startTime: 1_000_000, durationNs: 2_000_000_000 },
      1_100_000,
    ),
    { from: 700_000, to: 1_100_000 },
  );
});

test('rejects missing and invalid trace summaries', () => {
  const invalidSummaries = [
    undefined,
    {},
    { startTime: '1000000', durationNs: 2_000_000_000 },
    { startTime: Number.NaN, durationNs: 2_000_000_000 },
    { startTime: 1_000_000, durationNs: Number.POSITIVE_INFINITY },
    { startTime: 1_000_000, durationNs: -1 },
  ];

  invalidSummaries.forEach((summary) => {
    assert.equal(traceInvestigationWindow(summary, 2_000_000), null);
  });
  assert.equal(
    traceInvestigationWindow(
      { startTime: 2_000_000, durationNs: 1_000_000 },
      1_000_000,
    ),
    null,
  );
});

test('derives span investigation context with resource attribute precedence', () => {
  const context = spanInvestigationContext(
    {
      traceId: 'trace-span',
      spanId: 'span-1',
      service: 'checkout-service',
      name: 'POST /orders',
      statusCode: ' ERROR ',
      resourceAttributes: {
        'service.instance.id': ' checkout-7f9 ',
        'deployment.environment.name': ' production ',
        'service.namespace': ' payments ',
        'k8s.namespace.name': 'ignored-k8s-namespace',
      },
    },
    {
      traceId: 'trace-summary',
      startTime: 1_000_000,
      durationNs: 2_000_000_000,
      serviceInstanceId: 'summary-instance',
      environment: 'summary-environment',
      k8sNamespace: 'summary-namespace',
    },
    2_000_000,
  );

  assert.deepEqual(context, {
    from: 700_000,
    to: 1_302_000,
    service: 'checkout-service',
    operation: 'POST /orders',
    traceId: 'trace-span',
    spanId: 'span-1',
    serviceInstanceId: 'checkout-7f9',
    environment: 'production',
    namespace: 'payments',
    spanStatus: 'error',
  });
});

test('falls back to summary resource dimensions and trace id', () => {
  const context = spanInvestigationContext(
    {
      traceId: '   ',
      spanId: ' span-2 ',
      service: ' inventory ',
      name: ' GET /stock ',
      statusCode: 'Ok',
      resourceAttributes: {
        'service.instance.id': ' ',
        'deployment.environment.name': '',
        'service.namespace': ' ',
        'k8s.namespace.name': ' runtime-namespace ',
      },
    },
    {
      traceId: 'trace-summary',
      startTime: 10_000,
      durationNs: 1_000_000,
      serviceInstanceId: 'inventory-1',
      environment: 'staging',
      k8sNamespace: 'summary-namespace',
    },
    1_000_000,
  );

  assert.deepEqual(context, {
    from: -290_000,
    to: 310_001,
    service: 'inventory',
    operation: 'GET /stock',
    traceId: 'trace-summary',
    spanId: 'span-2',
    serviceInstanceId: 'inventory-1',
    environment: 'staging',
    namespace: 'runtime-namespace',
    spanStatus: undefined,
  });
});

test('falls back from service namespace to Kubernetes namespace and then summary', () => {
  const span = {
    spanId: 'span-namespace',
    resourceAttributes: {
      'service.namespace': ' ',
      'k8s.namespace.name': ' runtime-namespace ',
    },
  };
  assert.equal(
    spanInvestigationContext(span, { k8sNamespace: 'summary-namespace' }, 1_000)?.namespace,
    'runtime-namespace',
  );
  assert.equal(
    spanInvestigationContext(
      { ...span, resourceAttributes: { 'k8s.namespace.name': ' ' } },
      { k8sNamespace: ' summary-namespace ' },
      1_000,
    )?.namespace,
    'summary-namespace',
  );
});

test('keeps span context without an invented window and rejects a missing span', () => {
  assert.deepEqual(
    spanInvestigationContext(
      {
        traceId: 'trace-1',
        spanId: 'span-1',
        service: 'orders',
        name: 'place order',
        statusCode: 'unset',
        resourceAttributes: null,
      },
      null,
      2_000_000,
    ),
    {
      from: undefined,
      to: undefined,
      service: 'orders',
      operation: 'place order',
      traceId: 'trace-1',
      spanId: 'span-1',
      serviceInstanceId: undefined,
      environment: undefined,
      namespace: undefined,
      spanStatus: undefined,
    },
  );
  assert.equal(spanInvestigationContext(null, {}, 2_000_000), null);
  assert.equal(spanInvestigationContext([], {}, 2_000_000), null);
});

test('parses a complete integer investigation range', () => {
  assert.deepEqual(
    readInvestigationRange(new URLSearchParams({ from: '700000', to: '1302000' })),
    { from: 700_000, to: 1_302_000 },
  );
  assert.deepEqual(parseInvestigationRange('from=1&to=2'), { from: 1, to: 2 });
});

test('rejects malformed investigation range parameters', () => {
  const malformed = [
    '',
    'from=1',
    'to=2',
    'from=&to=2',
    'from=one&to=2',
    'from=1&to=Infinity',
    'from=1.5&to=2',
    'from=2&to=2',
    'from=3&to=2',
  ];

  malformed.forEach((search) => {
    assert.equal(readInvestigationRange(new URLSearchParams(search)), null);
  });
});

test('builds the trace investigation destination with span selector fields', () => {
  const path = buildInvestigationPath('traces', {
    from: 700_000,
    to: 1_302_000,
    service: 'checkout-service',
    operation: 'POST /orders',
    traceId: 'ignored-trace',
  });
  const url = new URL(path, 'http://localhost');

  assert.equal(url.pathname, '/traces');
  assert.deepEqual([...url.searchParams.entries()], [
    ['from', '700000'],
    ['to', '1302000'],
    ['spanService', 'checkout-service'],
    ['spanOperation', 'POST /orders'],
  ]);
});

test('adds only an explicitly requested error span status', () => {
  const errorUrl = new URL(buildInvestigationPath('traces', {
    from: 1,
    to: 2,
    spanStatus: 'error',
  }), 'http://localhost');
  const okUrl = new URL(buildInvestigationPath('traces', {
    from: 1,
    to: 2,
    spanStatus: 'ok',
  }), 'http://localhost');

  assert.equal(errorUrl.searchParams.get('spanStatus'), 'error');
  assert.equal(okUrl.searchParams.has('spanStatus'), false);
});

test('builds the log investigation destination with trace and span scope', () => {
  const path = buildInvestigationPath('logs', {
    from: 1,
    to: 2,
    traceId: 'trace-1',
    spanId: 'span-1',
    service: 'orders',
    operation: 'ignored-operation',
  });
  const url = new URL(path, 'http://localhost');

  assert.equal(url.pathname, '/logs');
  assert.deepEqual([...url.searchParams.entries()], [
    ['from', '1'],
    ['to', '2'],
    ['traceId', 'trace-1'],
    ['spanId', 'span-1'],
    ['service', 'orders'],
  ]);
});

test('builds a log investigation destination with text and resource dimensions', () => {
  const path = buildInvestigationPath('logs', {
    from: 1,
    to: 2,
    traceId: 'trace-1',
    spanId: 'span-1',
    service: 'orders',
    q: 'POST /orders?a=1&b=2',
    serviceInstanceId: 'orders-7f9',
    environment: 'production',
    namespace: 'payments',
  });
  const url = new URL(path, 'http://localhost');

  assert.deepEqual([...url.searchParams.entries()], [
    ['from', '1'],
    ['to', '2'],
    ['traceId', 'trace-1'],
    ['spanId', 'span-1'],
    ['service', 'orders'],
    ['q', 'POST /orders?a=1&b=2'],
    ['serviceInstanceId', 'orders-7f9'],
    ['environment', 'production'],
    ['namespace', 'payments'],
  ]);
});

test('omits log text and resource dimensions that the caller leaves empty', () => {
  const selectedInstanceId = 'all';
  const path = buildInvestigationPath('logs', {
    from: 1,
    to: 2,
    service: 'orders',
    q: '   ',
    serviceInstanceId: selectedInstanceId === 'all' ? undefined : selectedInstanceId,
    environment: '',
    namespace: null,
  });
  const url = new URL(path, 'http://localhost');

  assert.deepEqual([...url.searchParams.entries()], [
    ['from', '1'],
    ['to', '2'],
    ['service', 'orders'],
  ]);
});

test('builds the metrics investigation destination with resource dimensions', () => {
  const path = buildInvestigationPath('metrics', {
    from: 1,
    to: 2,
    service: 'orders',
    serviceInstanceId: 'orders-1',
    environment: 'production',
    namespace: 'payments',
  });
  const url = new URL(path, 'http://localhost');

  assert.equal(url.pathname, '/metrics');
  assert.deepEqual([...url.searchParams.entries()], [
    ['from', '1'],
    ['to', '2'],
    ['service', 'orders'],
    ['serviceInstanceId', 'orders-1'],
    ['environment', 'production'],
    ['namespace', 'payments'],
  ]);
});

test('builds the service investigation destination with focus', () => {
  const path = buildInvestigationPath('services', {
    from: 1,
    to: 2,
    service: 'orders',
  });
  const url = new URL(path, 'http://localhost');

  assert.equal(url.pathname, '/services');
  assert.deepEqual([...url.searchParams.entries()], [
    ['from', '1'],
    ['to', '2'],
    ['focus', 'orders'],
  ]);
});

test('omits empty investigation fields and non-error span statuses', () => {
  const path = buildInvestigationPath('traces', {
    from: 1,
    to: 2,
    service: '',
    operation: '   ',
    spanStatus: 'ok',
  });
  const url = new URL(path, 'http://localhost');

  assert.deepEqual([...url.searchParams.entries()], [
    ['from', '1'],
    ['to', '2'],
  ]);
});

test('rejects unknown destinations and invalid destination ranges', () => {
  assert.equal(buildInvestigationPath('unknown', { from: 1, to: 2 }), null);
  assert.equal(buildInvestigationPath('toString', { from: 1, to: 2 }), null);
  assert.equal(buildInvestigationPath('logs', null), null);
  assert.equal(buildInvestigationPath('metrics', { from: 2, to: 2 }), null);
  assert.equal(buildInvestigationPath('services', { from: 1.5, to: 2 }), null);
});

test('clamps a parsed future range once and rejects one starting after now', () => {
  assert.deepEqual(
    clampInvestigationRange({ from: 700_000, to: 2_000_000 }, 1_100_000),
    { from: 700_000, to: 1_100_000 },
  );
  assert.equal(
    clampInvestigationRange({ from: 1_100_000, to: 2_000_000 }, 1_000_000),
    null,
  );
});

test('builds a round-trippable attribute search path with special characters', () => {
  const condition = {
    scope: 'resource',
    key: 'enduser.name/中文',
    operator: 'equals',
    value: 'name="张三" & status=ok',
  };
  const path = buildTraceAttributeSearchPath(condition, { from: 700_000, to: 1_302_000 });
  const url = new URL(path, 'http://localhost');

  assert.equal(url.pathname, '/traces');
  assert.equal(url.searchParams.get('from'), '700000');
  assert.equal(url.searchParams.get('to'), '1302000');
  assert.deepEqual(JSON.parse(url.searchParams.get('attributes')), [condition]);
});

test('serializes trace attributes through the generic investigation adapter', () => {
  const condition = {
    scope: 'span',
    key: 'http.route',
    operator: 'equals',
    value: '/orders/:id',
  };
  const path = buildInvestigationPath('traces', {
    from: 1,
    to: 2,
    service: 'checkout',
    operation: 'POST /orders',
    spanStatus: 'error',
    attributeConditions: [condition],
  });
  const url = new URL(path, 'http://localhost');

  assert.deepEqual([...url.searchParams.entries()], [
    ['from', '1'],
    ['to', '2'],
    ['spanService', 'checkout'],
    ['spanOperation', 'POST /orders'],
    ['spanStatus', 'error'],
    ['attributes', JSON.stringify([condition])],
  ]);
  assert.equal(buildInvestigationPath('traces', {
    from: 1,
    to: 2,
    attributeConditions: [{ ...condition, value: 'v'.repeat(513) }],
  }), null);
});

test('keeps the requested attribute scope and rejects invalid windows', () => {
  const spanCondition = {
    scope: 'span',
    key: 'http.route',
    operator: 'equals',
    value: '/orders/:id',
  };
  const path = buildTraceAttributeSearchPath(spanCondition, { from: 1, to: 2 });
  const url = new URL(path, 'http://localhost');

  assert.equal(JSON.parse(url.searchParams.get('attributes'))[0].scope, 'span');
  assert.equal(buildTraceAttributeSearchPath(spanCondition, null), null);
  assert.equal(buildTraceAttributeSearchPath(spanCondition, { from: 2, to: 2 }), null);
  assert.equal(buildTraceAttributeSearchPath(spanCondition, { from: 1.5, to: 2 }), null);
});

test('rejects unsupported attribute lengths without throwing from a shortcut', () => {
  const window = { from: 1, to: 2 };
  const condition = {
    scope: 'span',
    key: 'db.query.text',
    operator: 'equals',
    value: 'v'.repeat(512),
  };

  assert.notEqual(buildTraceAttributeSearchPath(condition, window), null);
  assert.equal(
    buildTraceAttributeSearchPath({ ...condition, key: 'k'.repeat(129) }, window),
    null,
  );
  assert.equal(
    buildTraceAttributeSearchPath({ ...condition, value: 'v'.repeat(513) }, window),
    null,
  );
});
