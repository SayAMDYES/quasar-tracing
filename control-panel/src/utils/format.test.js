/**
 * Precision-safe telemetry formatting tests.
 *
 * @author Quasar
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration } from './format.js';

test('formats decimal-string durations without converting through Number', () => {
  assert.equal(formatDuration('999'), '999ns');
  assert.equal(formatDuration('2000000'), '2.00ms');
  assert.equal(formatDuration('18446744073709551615'), '18446744073.71s');
});
