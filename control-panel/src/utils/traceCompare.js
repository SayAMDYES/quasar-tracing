/**
 * Deterministic structural comparison for two canonical Trace Documents.
 *
 * @author Quasar
 */
import { normalizeTraceDocument } from './traceDocument.js';

export const MAX_COMPARE_SPANS = 30_000;
const REGRESSION_ABSOLUTE_NANO = 1_000_000n;
const VIRTUAL_ROOT_KEY = '$';

class TraceCompareError extends Error {
  constructor(code) {
    super(code);
    this.name = 'TraceCompareError';
    this.code = code;
  }
}

function compareUnicode(left, right) {
  const leftPoints = Array.from(String(left), (character) => character.codePointAt(0));
  const rightPoints = Array.from(String(right), (character) => character.codePointAt(0));
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

function startOf(span) {
  return BigInt(span.startTimeUnixNano);
}

function durationOf(span) {
  return BigInt(span.durationNano);
}

function endOf(span) {
  return startOf(span) + durationOf(span);
}

function compareSpans(left, right) {
  const leftStart = startOf(left);
  const rightStart = startOf(right);
  if (leftStart !== rightStart) return leftStart < rightStart ? -1 : 1;
  return compareUnicode(left.spanId, right.spanId);
}

function signatureOf(span) {
  return {
    serviceName: span.serviceName,
    name: span.name,
    kind: span.kind,
  };
}

function signatureKey(span) {
  return JSON.stringify([span.serviceName, span.name, span.kind]);
}

function buildStructuralIndex(document) {
  const byId = new Map(document.spans.map((span) => [span.spanId, span]));
  const cycleRepresentatives = new Set(document.warnings
    .filter(({ code }) => code === 'PARENT_CYCLE')
    .map(({ spanId }) => spanId));
  const childrenBySpanId = new Map(document.spans.map((span) => [span.spanId, []]));
  const roots = [];
  document.spans.forEach((span) => {
    const parent = span.parentSpanId && byId.has(span.parentSpanId)
      && !cycleRepresentatives.has(span.spanId)
      && span.parentSpanId !== span.spanId ? span.parentSpanId : null;
    if (parent) childrenBySpanId.get(parent).push(span);
    else roots.push(span);
  });

  const nodes = new Map();
  const topologyChildren = new Map([[VIRTUAL_ROOT_KEY, roots]]);
  childrenBySpanId.forEach((children, spanId) => topologyChildren.set(spanId, children));
  const stack = [{ parentSpanId: null, parentMatchKey: VIRTUAL_ROOT_KEY, depth: 0 }];
  while (stack.length) {
    const current = stack.pop();
    const children = topologyChildren.get(current.parentSpanId || VIRTUAL_ROOT_KEY) || [];
    const groups = new Map();
    children.forEach((span) => {
      const key = signatureKey(span);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(span);
    });
    const childNodes = [];
    [...groups.keys()].sort(compareUnicode).forEach((key) => {
      groups.get(key).sort(compareSpans).forEach((span, occurrence) => {
        const matchKey = `${current.parentMatchKey}/${key}#${occurrence}`;
        const node = {
          matchKey,
          parentMatchKey: current.parentMatchKey,
          depth: current.depth,
          occurrence,
          signature: signatureOf(span),
          span,
        };
        nodes.set(matchKey, node);
        childNodes.push(node);
      });
    });
    for (let index = childNodes.length - 1; index >= 0; index -= 1) {
      const node = childNodes[index];
      stack.push({
        parentSpanId: node.span.spanId,
        parentMatchKey: node.matchKey,
        depth: node.depth + 1,
      });
    }
  }

  const selfDurationById = new Map();
  document.spans.forEach((span) => {
    const parentStart = startOf(span);
    const parentEnd = endOf(span);
    const intervals = (childrenBySpanId.get(span.spanId) || [])
      .map((child) => [
        startOf(child) < parentStart ? parentStart : startOf(child),
        endOf(child) > parentEnd ? parentEnd : endOf(child),
      ])
      .filter(([start, end]) => end > start)
      .sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1
        : left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0);
    let covered = 0n;
    let intervalStart = null;
    let intervalEnd = null;
    intervals.forEach(([start, end]) => {
      if (intervalStart === null) {
        intervalStart = start;
        intervalEnd = end;
      } else if (start <= intervalEnd) {
        if (end > intervalEnd) intervalEnd = end;
      } else {
        covered += intervalEnd - intervalStart;
        intervalStart = start;
        intervalEnd = end;
      }
    });
    if (intervalStart !== null) covered += intervalEnd - intervalStart;
    const selfDuration = durationOf(span) - covered;
    selfDurationById.set(span.spanId, selfDuration > 0n ? selfDuration : 0n);
  });

  const critical = buildCriticalProfile(document, roots, childrenBySpanId);
  return { nodes, selfDurationById, critical };
}

function clippedCandidates(spans, start, end) {
  return spans.map((span) => ({
    span,
    start: startOf(span) < start ? start : startOf(span),
    end: endOf(span) > end ? end : endOf(span),
  })).filter((candidate) => candidate.end > candidate.start)
    .sort((left, right) => left.end < right.end ? -1 : left.end > right.end ? 1
      : -compareSpans(left.span, right.span));
}

function buildCriticalProfile(document, roots, childrenBySpanId) {
  const traceStart = BigInt(document.startTimeUnixNano);
  const traceEnd = traceStart + BigInt(document.durationNano);
  const members = new Set();
  let durationNano = 0n;
  const addSection = (span, start, end) => {
    if (end <= start) return;
    durationNano += end - start;
    members.add(span.spanId);
  };
  const rootCandidates = clippedCandidates(roots, traceStart, traceEnd);
  const selectedRoots = [];
  let rootCursor = traceEnd;
  for (let index = rootCandidates.length - 1; index >= 0;) {
    while (index >= 0 && rootCandidates[index].end > rootCursor) index -= 1;
    if (index < 0) break;
    const root = rootCandidates[index];
    selectedRoots.push(root);
    rootCursor = root.start;
    index -= 1;
  }
  const stack = [...selectedRoots].reverse();
  while (stack.length) {
    const current = stack.pop();
    const candidates = clippedCandidates(
      childrenBySpanId.get(current.span.spanId) || [],
      current.start,
      current.end,
    );
    const selectedChildren = [];
    let cursor = current.end;
    for (let index = candidates.length - 1; index >= 0;) {
      while (index >= 0 && candidates[index].end > cursor) index -= 1;
      if (index < 0) break;
      const child = candidates[index];
      addSection(current.span, child.end, cursor);
      selectedChildren.push(child);
      cursor = child.start;
      index -= 1;
    }
    addSection(current.span, current.start, cursor);
    for (let index = selectedChildren.length - 1; index >= 0; index -= 1) {
      stack.push(selectedChildren[index]);
    }
  }
  return { members, durationNano };
}

function percentDelta(baseline, delta) {
  if (baseline === 0n) return null;
  return Number((delta * 10_000n) / baseline) / 100;
}

function metricDiff(baseline, candidate, suffix = 'Nano') {
  if (baseline == null || candidate == null) {
    return {
      [`a${suffix}`]: baseline == null ? null : baseline.toString(),
      [`b${suffix}`]: candidate == null ? null : candidate.toString(),
      [`delta${suffix}`]: null,
      percent: null,
    };
  }
  const delta = candidate - baseline;
  return {
    [`a${suffix}`]: baseline.toString(),
    [`b${suffix}`]: candidate.toString(),
    [`delta${suffix}`]: delta.toString(),
    percent: percentDelta(baseline, delta),
  };
}

function mapDiff(baseline = {}, candidate = {}) {
  const keys = [...new Set([...Object.keys(baseline), ...Object.keys(candidate)])]
    .sort(compareUnicode);
  const added = [];
  const removed = [];
  const changed = [];
  keys.forEach((key) => {
    const hasA = Object.hasOwn(baseline, key);
    const hasB = Object.hasOwn(candidate, key);
    if (!hasA) added.push({ key, value: candidate[key] });
    else if (!hasB) removed.push({ key, value: baseline[key] });
    else if (baseline[key] !== candidate[key]) {
      changed.push({ key, before: baseline[key], after: candidate[key] });
    }
  });
  return { added, removed, changed };
}

function eventSignature(event) {
  return JSON.stringify([
    event.name,
    Object.keys(event.attributes || {}).sort(compareUnicode)
      .map((key) => [key, event.attributes[key]]),
  ]);
}

function eventDiff(baseline = [], candidate = []) {
  const collect = (events) => {
    const result = new Map();
    events.forEach((event) => {
      const signature = eventSignature(event);
      const entry = result.get(signature) || {
        name: event.name,
        attributes: event.attributes || {},
        count: 0,
      };
      entry.count += 1;
      result.set(signature, entry);
    });
    return result;
  };
  const a = collect(baseline);
  const b = collect(candidate);
  const added = [];
  const removed = [];
  [...new Set([...a.keys(), ...b.keys()])].sort(compareUnicode).forEach((signature) => {
    const aCount = a.get(signature)?.count || 0;
    const bCount = b.get(signature)?.count || 0;
    if (bCount > aCount) added.push({ ...b.get(signature), count: bCount - aCount });
    if (aCount > bCount) removed.push({ ...a.get(signature), count: aCount - bCount });
  });
  return { added, removed };
}

function hasMapChanges(diff) {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
}

function isRegression(baseline, candidate) {
  return baseline > 0n
    && candidate - baseline >= REGRESSION_ABSOLUTE_NANO
    && candidate * 100n >= baseline * 110n;
}

function buildRow(aNode, bNode, aIndex, bIndex) {
  const a = aNode?.span || null;
  const b = bNode?.span || null;
  const aDuration = a ? durationOf(a) : null;
  const bDuration = b ? durationOf(b) : null;
  const aSelf = a ? aIndex.selfDurationById.get(a.spanId) : null;
  const bSelf = b ? bIndex.selfDurationById.get(b.spanId) : null;
  const resourceDiff = mapDiff(a?.resourceAttributes, b?.resourceAttributes);
  const spanDiff = mapDiff(a?.spanAttributes, b?.spanAttributes);
  const events = eventDiff(a?.events, b?.events);
  const statusChanged = Boolean(a && b && (
    a.status.code !== b.status.code || a.status.message !== b.status.message
  ));
  const attributesChanged = hasMapChanges(resourceDiff) || hasMapChanges(spanDiff);
  const eventsChanged = events.added.length > 0 || events.removed.length > 0;
  const criticalA = a ? aIndex.critical.members.has(a.spanId) : false;
  const criticalB = b ? bIndex.critical.members.has(b.spanId) : false;
  const durationChanged = aDuration != null && bDuration != null && aDuration !== bDuration;
  const selfDurationChanged = aSelf != null && bSelf != null && aSelf !== bSelf;
  const added = !a && Boolean(b);
  const removed = Boolean(a) && !b;
  const regression = aDuration != null && bDuration != null && (
    isRegression(aDuration, bDuration) || isRegression(aSelf, bSelf)
  );
  const node = aNode || bNode;
  const change = {
    added,
    removed,
    regression,
    durationChanged,
    selfDurationChanged,
    statusChanged,
    attributesChanged,
    eventsChanged,
    criticalPathChanged: Boolean(a && b && criticalA !== criticalB),
  };
  change.changed = Object.values(change).some(Boolean);
  return {
    matchKey: node.matchKey,
    parentMatchKey: node.parentMatchKey,
    depth: node.depth,
    occurrence: node.occurrence,
    signature: node.signature,
    a,
    b,
    duration: metricDiff(aDuration, bDuration),
    selfDuration: metricDiff(aSelf, bSelf),
    criticalPath: { a: criticalA, b: criticalB },
    status: { a: a?.status || null, b: b?.status || null },
    attributeDiff: { resource: resourceDiff, span: spanDiff },
    eventDiff: events,
    change,
  };
}

function summaryMetric(a, b) {
  const baseline = BigInt(a);
  const candidate = BigInt(b);
  const delta = candidate - baseline;
  return {
    a: baseline.toString(),
    b: candidate.toString(),
    delta: delta.toString(),
    percent: percentDelta(baseline, delta),
  };
}

function errorCount(document) {
  return document.spans.filter(({ status }) => String(status.code).toLowerCase() === 'error').length;
}

export function buildTraceComparison(baselineInput, candidateInput) {
  const combinedSpans = (Array.isArray(baselineInput?.spans) ? baselineInput.spans.length : 0)
    + (Array.isArray(candidateInput?.spans) ? candidateInput.spans.length : 0);
  if (combinedSpans > MAX_COMPARE_SPANS) throw new TraceCompareError('COMPARE_SPAN_LIMIT_EXCEEDED');
  const baseline = normalizeTraceDocument(baselineInput);
  const candidate = normalizeTraceDocument(candidateInput);
  const aIndex = buildStructuralIndex(baseline);
  const bIndex = buildStructuralIndex(candidate);
  const keys = new Set([...aIndex.nodes.keys(), ...bIndex.nodes.keys()]);
  const rowsByKey = new Map();
  keys.forEach((key) => rowsByKey.set(
    key,
    buildRow(aIndex.nodes.get(key), bIndex.nodes.get(key), aIndex, bIndex),
  ));
  const childrenByParent = new Map();
  rowsByKey.forEach((row) => {
    if (!childrenByParent.has(row.parentMatchKey)) childrenByParent.set(row.parentMatchKey, []);
    childrenByParent.get(row.parentMatchKey).push(row);
  });
  childrenByParent.forEach((children) => children.sort((left, right) => (
    compareUnicode(JSON.stringify(Object.values(left.signature)), JSON.stringify(Object.values(right.signature)))
    || left.occurrence - right.occurrence
  )));
  const rows = [];
  const stack = [...(childrenByParent.get(VIRTUAL_ROOT_KEY) || [])].reverse();
  while (stack.length) {
    const row = stack.pop();
    rows.push(row);
    const children = childrenByParent.get(row.matchKey) || [];
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
  }

  return {
    baseline: { traceId: baseline.traceId },
    candidate: { traceId: candidate.traceId },
    summary: {
      duration: summaryMetric(baseline.durationNano, candidate.durationNano),
      spanCount: summaryMetric(baseline.spans.length, candidate.spans.length),
      errorCount: summaryMetric(errorCount(baseline), errorCount(candidate)),
      serviceCount: summaryMetric(baseline.services.length, candidate.services.length),
      criticalPathDuration: summaryMetric(
        aIndex.critical.durationNano,
        bIndex.critical.durationNano,
      ),
    },
    rows,
  };
}
