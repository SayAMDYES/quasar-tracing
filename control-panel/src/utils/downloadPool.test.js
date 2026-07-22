import test from 'node:test';
import assert from 'node:assert/strict';

import { downloadTraceDocuments } from './downloadPool.js';

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test('never exceeds four active requests and preserves input order', async () => {
  let active = 0;
  let maximum = 0;
  const progress = [];
  const items = Array.from({ length: 12 }, (_, index) => `trace-${index}`);
  const result = await downloadTraceDocuments(items, async (item) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await delay((11 - Number(item.split('-')[1])) % 4);
    active -= 1;
    return { traceId: item };
  }, { onProgress: (value) => progress.push(value) });

  assert.equal(maximum, 4);
  assert.deepEqual(result.results.map(({ item }) => item), items);
  assert.equal(result.failures.length, 0);
  assert.deepEqual(progress.at(-1), { completed: 12, total: 12, succeeded: 12, failed: 0 });
});

test('times out after the configured budget and retries once', async () => {
  let attempts = 0;
  const result = await downloadTraceDocuments(['trace'], () => {
    attempts += 1;
    return new Promise(() => {});
  }, {
    timeoutMs: 5,
    retryDelayMs: 0,
    jitter: () => 0,
    sleep: async () => {},
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result.failures.map(({ code }) => code), ['DOWNLOAD_TIMEOUT']);
});

test('retries network and selected HTTP statuses with injected jitter', async () => {
  const retryable = [undefined, 429, 502, 503, 504];
  const sleeps = [];
  for (const status of retryable) {
    let attempts = 0;
    const result = await downloadTraceDocuments([String(status)], async () => {
      attempts += 1;
      if (attempts === 1) throw status === undefined
        ? new Error('network')
        : Object.assign(new Error(`HTTP ${status}`), { status });
      return 'ok';
    }, {
      jitter: () => 125,
      sleep: async (milliseconds) => sleeps.push(milliseconds),
    });
    assert.equal(attempts, 2);
    assert.equal(result.results[0].value, 'ok');
  }
  assert.deepEqual(sleeps, Array(5).fill(625));
});

test('does not retry other 4xx and returns stable sanitized failures', async () => {
  let attempts = 0;
  const result = await downloadTraceDocuments(['missing'], async () => {
    attempts += 1;
    throw Object.assign(new Error('backend payload must not leak'), {
      response: { status: 404, data: { secret: 'value' } },
    });
  });

  assert.equal(attempts, 1);
  assert.deepEqual(result.failures, [{
    item: 'missing',
    code: 'HTTP_404',
    message: 'HTTP_404',
  }]);
});

test('reports all-fail and partial-fail results without reordering', async () => {
  const partial = await downloadTraceDocuments(['a', 'b', 'c'], async (item) => {
    if (item !== 'b') throw Object.assign(new Error('bad'), { status: 400 });
    return item.toUpperCase();
  });
  assert.deepEqual(partial.results, [{ item: 'b', value: 'B' }]);
  assert.deepEqual(partial.failures.map(({ item }) => item), ['a', 'c']);

  const failed = await downloadTraceDocuments(['a', 'b'], async () => {
    throw Object.assign(new Error('bad'), { status: 400 });
  });
  assert.equal(failed.results.length, 0);
  assert.deepEqual(failed.failures.map(({ item }) => item), ['a', 'b']);
});

test('aborts active requests, schedules no file result and rejects as cancelled', async () => {
  const controller = new AbortController();
  let started = 0;
  const request = downloadTraceDocuments(
    Array.from({ length: 20 }, (_, index) => String(index)),
    (_, { signal }) => new Promise((resolve, reject) => {
      started += 1;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
    { signal: controller.signal },
  );
  await delay(5);
  controller.abort();

  await assert.rejects(request, { message: 'DOWNLOAD_CANCELLED', code: 'DOWNLOAD_CANCELLED' });
  assert.equal(started, 4);
});
