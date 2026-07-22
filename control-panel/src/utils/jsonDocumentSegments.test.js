import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVisualSegmentIndex,
  findTextMatches,
  getVisibleSegmentRange,
  getVisualSegments,
  mapTextOffsetToSegment,
} from './jsonDocumentSegments.js';

test('indexes unwrapped logical lines as fixed-height visual segments', () => {
  const text = '{\n  "ok": true\n}\n';
  const index = buildVisualSegmentIndex(text, { wrap: false });
  const segments = getVisualSegments(text, index, 0, index.segmentCount);

  assert.equal(index.segmentCount, 4);
  assert.deepEqual(segments.map(({ logicalLine, startCodePoint, endCodePoint, text: value }) => ({
    logicalLine, startCodePoint, endCodePoint, text: value,
  })), [
    { logicalLine: 0, startCodePoint: 0, endCodePoint: 1, text: '{' },
    { logicalLine: 1, startCodePoint: 0, endCodePoint: 12, text: '  "ok": true' },
    { logicalLine: 2, startCodePoint: 0, endCodePoint: 1, text: '}' },
    { logicalLine: 3, startCodePoint: 0, endCodePoint: 0, text: '' },
  ]);
});

test('wraps by Unicode code points and preserves UTF-16 text offsets', () => {
  const text = `${'a'.repeat(39)}😀b\nnext`;
  const index = buildVisualSegmentIndex(text, {
    wrap: true,
    containerWidth: 320,
    characterWidth: 8,
  });
  const segments = getVisualSegments(text, index, 0, index.segmentCount);

  assert.equal(index.columnsPerSegment, 40);
  assert.equal(index.segmentCount, 3);
  assert.equal(segments[0].text, `${'a'.repeat(39)}😀`);
  assert.deepEqual(segments[0], {
    logicalLine: 0,
    startCodePoint: 0,
    endCodePoint: 40,
    startOffset: 0,
    endOffset: 41,
    text: `${'a'.repeat(39)}😀`,
  });
  assert.equal(segments[1].text, 'b');
  assert.equal(segments[2].text, 'next');
});

test('maps search offsets to wrapped segments and re-segments after resize', () => {
  const text = `${'a'.repeat(39)}😀target${'z'.repeat(34)}`;
  const narrow = buildVisualSegmentIndex(text, {
    wrap: true,
    containerWidth: 320,
    characterWidth: 8,
  });
  const wide = buildVisualSegmentIndex(text, {
    wrap: true,
    containerWidth: 640,
    characterWidth: 8,
  });
  const matches = findTextMatches(text, 'target');

  assert.deepEqual(matches, { offsets: [41], total: 1, truncated: false });
  assert.equal(narrow.segmentCount, 2);
  assert.equal(wide.segmentCount, 1);
  assert.equal(mapTextOffsetToSegment(narrow, matches.offsets[0]), 1);
  assert.equal(mapTextOffsetToSegment(wide, matches.offsets[0]), 0);
});

test('bounds rendered segments to the viewport and twenty-segment overscan', () => {
  assert.deepEqual(getVisibleSegmentRange({
    scrollTop: 1_000,
    viewportHeight: 100,
    rowHeight: 20,
    segmentCount: 1_000,
  }), { start: 30, end: 75 });

  assert.deepEqual(getVisibleSegmentRange({
    scrollTop: 0,
    viewportHeight: 100,
    rowHeight: 20,
    segmentCount: 12,
  }), { start: 0, end: 12 });
});

test('keeps visual materialization bounded for 50 MiB and 100 MiB text', () => {
  const text = 'x'.repeat(100 * 1024 * 1024);
  for (const size of [50 * 1024 * 1024, 100 * 1024 * 1024]) {
    const value = text.slice(0, size);
    const index = buildVisualSegmentIndex(value, {
      wrap: true,
      containerWidth: 320,
      characterWidth: 8,
    });
    const range = getVisibleSegmentRange({
      scrollTop: Math.floor(index.segmentCount / 2) * 20,
      viewportHeight: 500,
      rowHeight: 20,
      segmentCount: index.segmentCount,
    });
    const rendered = getVisualSegments(value, index, range.start, range.end);

    assert.equal(index.segmentCount, Math.ceil(size / 40));
    assert.ok(rendered.length <= Math.ceil(500 / 20) + 40);
  }
});
