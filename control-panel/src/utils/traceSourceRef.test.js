/**
 * Stable Trace source-reference contract tests.
 *
 * @author Quasar
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  archiveTraceRef,
  liveTraceRef,
  parseTraceSourceRef,
  traceComparePath,
  traceRefPath,
} from './traceSourceRef.js';

const TRACE_ID = '0123456789abcdef0123456789abcdef';

test('builds and parses live and archive source references', () => {
  assert.equal(liveTraceRef(TRACE_ID.toUpperCase()), `live:${TRACE_ID}`);
  assert.equal(archiveTraceRef(TRACE_ID.toUpperCase()), `archive:${TRACE_ID}`);

  assert.deepEqual(parseTraceSourceRef(`archive:${TRACE_ID}`), {
    source: 'archive',
    traceId: TRACE_ID,
    ref: `archive:${TRACE_ID}`,
  });
});

test('routes archive references without changing live routes', () => {
  assert.equal(traceRefPath(`live:${TRACE_ID}`), `/traces/${TRACE_ID}`);
  assert.equal(traceRefPath(`archive:${TRACE_ID}`), `/traces/${TRACE_ID}?source=archive`);
});

test('keeps archive references shareable in compare URLs and rejects malformed refs', () => {
  const path = traceComparePath(`archive:${TRACE_ID}`, `live:${TRACE_ID}`);
  const query = new URLSearchParams(path.split('?')[1]);
  assert.equal(query.get('a'), `archive:${TRACE_ID}`);
  assert.equal(query.get('b'), `live:${TRACE_ID}`);

  assert.equal(parseTraceSourceRef(`archive:${TRACE_ID.toUpperCase()}`), null);
  assert.equal(parseTraceSourceRef(`archive:${TRACE_ID}:extra`), null);
  assert.equal(parseTraceSourceRef('import:session-1'), null);
  assert.equal(parseTraceSourceRef('remote:session-1'), null);
  assert.equal(traceComparePath('invalid', `live:${TRACE_ID}`), null);
});
