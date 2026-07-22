/**
 * Fixed-height visual segmentation for large JSON documents.
 *
 * The index stays compact by recording logical lines and deriving individual
 * visual segment metadata only for the requested viewport.
 *
 * @author Quasar
 */

export const JSON_VIEWER_MIN_COLUMNS = 40;
export const JSON_VIEWER_OVERSCAN = 20;
export const JSON_VIEWER_MAX_SEARCH_MATCHES = 10_000;

const UNICODE_CHECKPOINT_INTERVAL = 256;

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function calculateColumnsPerSegment(containerWidth, characterWidth) {
  const width = positiveNumber(containerWidth, JSON_VIEWER_MIN_COLUMNS);
  const glyphWidth = positiveNumber(characterWidth, 1);
  return Math.max(JSON_VIEWER_MIN_COLUMNS, Math.floor(width / glyphWidth));
}

function measureLine(text, startOffset, endOffset) {
  let firstHighSurrogate = -1;
  for (let offset = startOffset; offset < endOffset; offset += 1) {
    const codeUnit = text.charCodeAt(offset);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      firstHighSurrogate = offset;
      break;
    }
  }
  if (firstHighSurrogate === -1) {
    return { codePointLength: endOffset - startOffset, checkpoints: null };
  }

  const checkpoints = [0];
  let codePoint = 0;
  let offset = startOffset;
  while (offset < endOffset) {
    if (codePoint > 0 && codePoint % UNICODE_CHECKPOINT_INTERVAL === 0) {
      checkpoints.push(offset - startOffset);
    }
    const high = text.charCodeAt(offset);
    const low = text.charCodeAt(offset + 1);
    const paired = high >= 0xD800 && high <= 0xDBFF
      && low >= 0xDC00 && low <= 0xDFFF
      && offset + 1 < endOffset;
    offset += paired ? 2 : 1;
    codePoint += 1;
  }
  return { codePointLength: codePoint, checkpoints };
}

/** Builds a compressed logical-line index for fixed-height visual segments. */
export function buildVisualSegmentIndex(text, options = {}) {
  if (typeof text !== 'string') throw new TypeError('JSON_TEXT_REQUIRED');
  const wrap = options.wrap === true;
  const columnsPerSegment = wrap
    ? calculateColumnsPerSegment(options.containerWidth, options.characterWidth)
    : null;
  const lines = [];
  let firstSegment = 0;
  let startOffset = 0;
  let logicalLine = 0;

  while (startOffset <= text.length) {
    const newlineOffset = text.indexOf('\n', startOffset);
    const endOffset = newlineOffset === -1 ? text.length : newlineOffset;
    const { codePointLength, checkpoints } = measureLine(text, startOffset, endOffset);
    const segmentCount = wrap
      ? Math.max(1, Math.ceil(codePointLength / columnsPerSegment))
      : 1;
    lines.push({
      logicalLine,
      startOffset,
      endOffset,
      codePointLength,
      firstSegment,
      segmentCount,
      checkpoints,
    });
    firstSegment += segmentCount;
    logicalLine += 1;
    if (newlineOffset === -1) break;
    startOffset = newlineOffset + 1;
  }

  return {
    wrap,
    columnsPerSegment,
    lineCount: lines.length,
    segmentCount: firstSegment,
    textLength: text.length,
    lines,
  };
}

function lineForSegment(index, segmentNumber) {
  let low = 0;
  let high = index.lines.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const line = index.lines[middle];
    if (segmentNumber < line.firstSegment) high = middle - 1;
    else if (segmentNumber >= line.firstSegment + line.segmentCount) low = middle + 1;
    else return line;
  }
  return null;
}

function offsetForCodePoint(text, line, targetCodePoint) {
  if (targetCodePoint <= 0) return line.startOffset;
  if (targetCodePoint >= line.codePointLength) return line.endOffset;
  if (!line.checkpoints) return line.startOffset + targetCodePoint;

  const checkpointIndex = Math.floor(targetCodePoint / UNICODE_CHECKPOINT_INTERVAL);
  let codePoint = checkpointIndex * UNICODE_CHECKPOINT_INTERVAL;
  let offset = line.startOffset + line.checkpoints[checkpointIndex];
  while (codePoint < targetCodePoint) {
    const high = text.charCodeAt(offset);
    const low = text.charCodeAt(offset + 1);
    offset += high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF
      ? 2 : 1;
    codePoint += 1;
  }
  return offset;
}

function codePointForOffset(text, line, targetOffset) {
  const boundedOffset = Math.max(line.startOffset, Math.min(targetOffset, line.endOffset));
  if (!line.checkpoints) return boundedOffset - line.startOffset;

  const relativeOffset = boundedOffset - line.startOffset;
  let low = 0;
  let high = line.checkpoints.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (line.checkpoints[middle] <= relativeOffset) low = middle;
    else high = middle - 1;
  }
  let codePoint = low * UNICODE_CHECKPOINT_INTERVAL;
  let offset = line.startOffset + line.checkpoints[low];
  while (offset < boundedOffset) {
    const highUnit = text.charCodeAt(offset);
    const lowUnit = text.charCodeAt(offset + 1);
    offset += highUnit >= 0xD800 && highUnit <= 0xDBFF
      && lowUnit >= 0xDC00 && lowUnit <= 0xDFFF ? 2 : 1;
    codePoint += 1;
  }
  return Math.min(codePoint, line.codePointLength);
}

export function getVisualSegment(text, index, segmentNumber) {
  if (!Number.isInteger(segmentNumber) || segmentNumber < 0
      || segmentNumber >= index.segmentCount) return null;
  const line = lineForSegment(index, segmentNumber);
  if (!line) return null;
  const segmentInLine = segmentNumber - line.firstSegment;
  const startCodePoint = index.wrap ? segmentInLine * index.columnsPerSegment : 0;
  const endCodePoint = index.wrap
    ? Math.min(line.codePointLength, startCodePoint + index.columnsPerSegment)
    : line.codePointLength;
  const startOffset = offsetForCodePoint(text, line, startCodePoint);
  const endOffset = offsetForCodePoint(text, line, endCodePoint);
  return {
    logicalLine: line.logicalLine,
    startCodePoint,
    endCodePoint,
    startOffset,
    endOffset,
    text: text.slice(startOffset, endOffset),
  };
}

export function getVisualSegments(text, index, start, end) {
  const boundedStart = Math.max(0, Math.min(index.segmentCount, Math.floor(start)));
  const boundedEnd = Math.max(boundedStart, Math.min(index.segmentCount, Math.ceil(end)));
  const segments = [];
  for (let segment = boundedStart; segment < boundedEnd; segment += 1) {
    segments.push(getVisualSegment(text, index, segment));
  }
  return segments;
}

export function getVisibleSegmentRange({
  scrollTop,
  viewportHeight,
  rowHeight,
  segmentCount,
  overscan = JSON_VIEWER_OVERSCAN,
}) {
  const height = positiveNumber(rowHeight, 1);
  const count = Math.max(0, Math.floor(segmentCount));
  const firstVisible = Math.floor(Math.max(0, scrollTop) / height);
  const visibleEnd = Math.ceil((Math.max(0, scrollTop) + Math.max(0, viewportHeight)) / height);
  return {
    start: Math.max(0, firstVisible - overscan),
    end: Math.min(count, visibleEnd + overscan),
  };
}

function lineForTextOffset(index, offset) {
  let low = 0;
  let high = index.lines.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const line = index.lines[middle];
    const nextStart = middle + 1 < index.lines.length
      ? index.lines[middle + 1].startOffset : index.textLength + 1;
    if (offset < line.startOffset) high = middle - 1;
    else if (offset >= nextStart) low = middle + 1;
    else return line;
  }
  return index.lines[index.lines.length - 1] || null;
}

/** Maps a UTF-16 String offset, such as String#indexOf, to a visual segment. */
export function mapTextOffsetToSegment(index, textOffset, text = null) {
  if (!Number.isFinite(textOffset) || index.segmentCount === 0) return -1;
  const boundedOffset = Math.max(0, Math.min(Math.floor(textOffset), index.textLength));
  const line = lineForTextOffset(index, boundedOffset);
  if (!line) return -1;
  const codePoint = text == null || !line.checkpoints
    ? Math.min(boundedOffset - line.startOffset, line.codePointLength)
    : codePointForOffset(text, line, boundedOffset);
  const segmentInLine = index.wrap
    ? Math.min(line.segmentCount - 1, Math.floor(codePoint / index.columnsPerSegment))
    : 0;
  return line.firstSegment + Math.max(0, segmentInLine);
}

export function findTextMatches(text, query, maxMatches = JSON_VIEWER_MAX_SEARCH_MATCHES) {
  if (typeof text !== 'string' || typeof query !== 'string' || query.length === 0) {
    return { offsets: [], total: 0, truncated: false };
  }
  const limit = Math.max(1, Math.floor(maxMatches));
  const offsets = [];
  let total = 0;
  let fromIndex = 0;
  while (fromIndex <= text.length - query.length) {
    const offset = text.indexOf(query, fromIndex);
    if (offset === -1) break;
    if (offsets.length < limit) offsets.push(offset);
    total += 1;
    fromIndex = offset + Math.max(1, query.length);
  }
  return { offsets, total, truncated: total > offsets.length };
}
