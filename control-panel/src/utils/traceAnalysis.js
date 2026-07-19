/**
 * Pure trace-tree analysis used by the trace detail workbench.
 *
 * @author Quasar
 */

function startOf(span) {
  const timestamp = Number(span?.timestamp);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function durationOf(span) {
  const durationMs = Number(span?.durationMs);
  if (Number.isFinite(durationMs)) return Math.max(0, durationMs);

  const durationNs = Number(span?.durationNs);
  return Number.isFinite(durationNs) ? Math.max(0, durationNs / 1e6) : 0;
}

function endOf(span) {
  return startOf(span) + durationOf(span);
}

function compareScalar(left, right) {
  const leftValue = String(left ?? '');
  const rightValue = String(right ?? '');
  if (leftValue < rightValue) return -1;
  if (leftValue > rightValue) return 1;
  return 0;
}

const spanSignatureCache = new WeakMap();

function stableValueSignature(value, ancestors = new Set()) {
  if (value === null) return 'null';

  const type = typeof value;
  if (type !== 'object') {
    if (type === 'number' && Object.is(value, -0)) return 'number:-0';
    if (type === 'string') return `string:${JSON.stringify(value)}`;
    return `${type}:${String(value)}`;
  }
  if (ancestors.has(value)) return 'circular';

  ancestors.add(value);
  const signature = Array.isArray(value)
    ? `[${value.map((item) => stableValueSignature(item, ancestors)).join(',')}]`
    : `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableValueSignature(value[key], ancestors)}`)
      .join(',')}}`;
  ancestors.delete(value);
  return signature;
}

function stableSpanSignature(span) {
  if (!spanSignatureCache.has(span)) {
    spanSignatureCache.set(span, stableValueSignature(span));
  }
  return spanSignatureCache.get(span);
}

function compareSpans(left, right) {
  return startOf(left) - startOf(right)
    || compareScalar(left?.spanId, right?.spanId)
    || durationOf(left) - durationOf(right)
    || compareScalar(left?.parentSpanId, right?.parentSpanId)
    || compareScalar(left?.service, right?.service)
    || compareScalar(left?.name, right?.name)
    || compareScalar(left?.statusCode, right?.statusCode)
    || compareScalar(left?.statusMessage, right?.statusMessage)
    || compareScalar(stableSpanSignature(left), stableSpanSignature(right));
}

function isErrorSpan(span) {
  return String(span?.statusCode ?? '').toLowerCase() === 'error';
}

function collectSearchValues(value, values, seen) {
  if (value == null) return;
  if (typeof value !== 'object') {
    values.push(String(value));
    return;
  }
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => collectSearchValues(item, values, seen));
    return;
  }

  Object.entries(value).forEach(([key, item]) => {
    values.push(key);
    collectSearchValues(item, values, seen);
  });
}

export function spanMatchesQuery(span, normalizedQuery) {
  const query = String(normalizedQuery ?? '').trim().toLowerCase();
  if (!query) return true;
  if (!span || typeof span !== 'object') return false;

  const values = [
    span.name,
    span.service,
    span.statusCode,
    span.statusMessage,
  ];
  const seen = new Set();
  collectSearchValues(span.resourceAttributes, values, seen);
  collectSearchValues(span.spanAttributes, values, seen);
  collectSearchValues(span.events, values, seen);

  return values.some((value) => String(value ?? '').toLowerCase().includes(query));
}

function normalizeForest(spans, byId) {
  const parentById = new Map();
  spans.forEach((span) => {
    const parentId = span.parentSpanId;
    parentById.set(
      span.spanId,
      parentId && parentId !== span.spanId && byId.has(parentId) ? parentId : null,
    );
  });

  const complete = new Set();
  spans.forEach((span) => {
    if (complete.has(span.spanId)) return;

    const chain = [];
    const chainIndex = new Map();
    let currentId = span.spanId;
    while (currentId != null && !complete.has(currentId)) {
      const cycleStart = chainIndex.get(currentId);
      if (cycleStart !== undefined) {
        const cycle = chain.slice(cycleStart);
        const promotedId = cycle.reduce((bestId, candidateId) => (
          compareSpans(byId.get(candidateId), byId.get(bestId)) < 0 ? candidateId : bestId
        ));
        parentById.set(promotedId, null);
        break;
      }

      chainIndex.set(currentId, chain.length);
      chain.push(currentId);
      currentId = parentById.get(currentId);
    }
    chain.forEach((spanId) => complete.add(spanId));
  });

  const childrenById = new Map();
  spans.forEach((span) => childrenById.set(span.spanId, []));
  const roots = [];
  spans.forEach((span) => {
    const parentId = parentById.get(span.spanId);
    if (parentId == null) roots.push(span);
    else childrenById.get(parentId).push(span);
  });
  roots.sort(compareSpans);
  childrenById.forEach((children) => children.sort(compareSpans));

  return { parentById, childrenById, roots };
}

function calculateSelfDuration(span, children) {
  const parentStart = startOf(span);
  const parentEnd = endOf(span);
  const intervals = children
    .map((child) => [
      Math.max(parentStart, startOf(child)),
      Math.min(parentEnd, endOf(child)),
    ])
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);

  let covered = 0;
  let currentStart;
  let currentEnd;
  intervals.forEach(([start, end]) => {
    if (currentStart == null) {
      currentStart = start;
      currentEnd = end;
    } else if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      covered += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  });
  if (currentStart != null) covered += currentEnd - currentStart;

  return Math.max(0, parentEnd - parentStart - covered);
}

function addCriticalSection(sections, span, start, end) {
  if (end <= start) return;
  sections.push({
    span,
    spanId: span.spanId,
    start,
    end,
    startTime: start,
    endTime: end,
    durationMs: end - start,
  });
}

function sortedCriticalCandidates(spans, start, end) {
  const candidates = spans
    .map((span) => ({
      span,
      start: Math.max(start, startOf(span)),
      end: Math.min(end, endOf(span)),
    }))
    .filter((candidate) => candidate.end > candidate.start);
  candidates.sort((left, right) => left.end - right.end
    || compareSpans(right.span, left.span));
  return candidates;
}

function buildCriticalSections(roots, childrenById, traceStart, traceEnd) {
  const sections = [];
  const rootCandidates = sortedCriticalCandidates(roots, traceStart, traceEnd);
  const selectedRoots = [];
  let rootCursor = traceEnd;
  let rootIndex = rootCandidates.length - 1;
  while (rootIndex >= 0) {
    while (rootIndex >= 0 && rootCandidates[rootIndex].end > rootCursor) {
      rootIndex -= 1;
    }
    if (rootIndex < 0) break;

    const root = rootCandidates[rootIndex];
    rootIndex -= 1;
    selectedRoots.push(root);
    rootCursor = root.start;
  }

  const stack = [];
  for (let index = selectedRoots.length - 1; index >= 0; index -= 1) {
    stack.push(selectedRoots[index]);
  }

  while (stack.length) {
    const { span, start, end } = stack.pop();
    if (end <= start) continue;

    const candidates = sortedCriticalCandidates(
      childrenById.get(span.spanId) || [],
      start,
      end,
    );
    const selectedChildren = [];
    let cursor = end;
    let candidateIndex = candidates.length - 1;
    while (candidateIndex >= 0) {
      while (candidateIndex >= 0 && candidates[candidateIndex].end > cursor) {
        candidateIndex -= 1;
      }
      if (candidateIndex < 0) break;

      const child = candidates[candidateIndex];
      candidateIndex -= 1;
      addCriticalSection(sections, span, child.end, cursor);
      selectedChildren.push(child);
      cursor = child.start;
    }
    addCriticalSection(sections, span, start, cursor);

    for (let index = selectedChildren.length - 1; index >= 0; index -= 1) {
      stack.push(selectedChildren[index]);
    }
  }

  sections.sort((left, right) => left.start - right.start
    || left.end - right.end
    || compareSpans(left.span, right.span));
  return sections;
}

function shouldReplaceRepresentative(current, candidate, metricsById) {
  if (!current) return true;
  const currentMetrics = metricsById.get(current.spanId);
  const candidateMetrics = metricsById.get(candidate.spanId);
  return candidateMetrics.selfDurationMs > currentMetrics.selfDurationMs
    || (candidateMetrics.selfDurationMs === currentMetrics.selfDurationMs
      && (durationOf(candidate) > durationOf(current)
        || (durationOf(candidate) === durationOf(current)
          && (startOf(candidate) < startOf(current)
            || (startOf(candidate) === startOf(current)
              && String(candidate.spanId).localeCompare(String(current.spanId)) < 0)))));
}

function updateStats(stats, key, identity, span, metrics, metricsById) {
  let row = stats.get(key);
  if (!row) {
    row = {
      ...identity,
      spanCount: 0,
      errorCount: 0,
      criticalSpanCount: 0,
      totalDurationMs: 0,
      selfDurationMs: 0,
      criticalDurationMs: 0,
      representativeSpan: null,
    };
    stats.set(key, row);
  }

  row.spanCount += 1;
  row.errorCount += isErrorSpan(span) ? 1 : 0;
  row.criticalSpanCount += metrics.criticalDurationMs > 0 ? 1 : 0;
  row.totalDurationMs += durationOf(span);
  row.selfDurationMs += metrics.selfDurationMs;
  row.criticalDurationMs += metrics.criticalDurationMs;
  if (shouldReplaceRepresentative(row.representativeSpan, span, metricsById)) {
    row.representativeSpan = span;
  }
}

function sortStats(rows, fields) {
  return rows.sort((left, right) => right.totalDurationMs - left.totalDurationMs
    || fields.reduce(
      (result, field) => result || String(left[field]).localeCompare(String(right[field])),
      0,
    ));
}

function materializePath(pathNode) {
  const path = new Array(pathNode.depth);
  let current = pathNode;
  for (let index = path.length - 1; index >= 0; index -= 1) {
    path[index] = current.value;
    current = current.parent;
  }
  return path;
}

function attachLazyPaths(rows) {
  return rows.map(({ pathNode, ...row }) => {
    Object.defineProperty(row, 'path', {
      enumerable: true,
      get: () => materializePath(pathNode),
    });
    return row;
  });
}

export function createTraceAnalysis(spans = []) {
  const candidates = (Array.isArray(spans) ? spans : [])
    .filter((span) => span && typeof span === 'object')
    .slice()
    .sort(compareSpans);
  const orderedSpans = [];
  const byId = new Map();
  candidates.forEach((span) => {
    const spanId = span.spanId;
    if (
      typeof spanId !== 'string'
      || !spanId
      || spanId.trim() !== spanId
      || byId.has(spanId)
    ) {
      return;
    }
    byId.set(spanId, span);
    orderedSpans.push(span);
  });
  const { parentById, childrenById, roots } = normalizeForest(orderedSpans, byId);

  let traceStart = 0;
  let traceEnd = 0;
  if (orderedSpans.length) {
    traceStart = startOf(orderedSpans[0]);
    traceEnd = endOf(orderedSpans[0]);
    orderedSpans.forEach((span) => {
      traceStart = Math.min(traceStart, startOf(span));
      traceEnd = Math.max(traceEnd, endOf(span));
    });
  }

  const criticalSections = buildCriticalSections(
    roots,
    childrenById,
    traceStart,
    traceEnd,
  );
  const criticalSpanIds = new Set(criticalSections.map((section) => section.spanId));
  const criticalDurationById = new Map();
  criticalSections.forEach((section) => {
    criticalDurationById.set(
      section.spanId,
      (criticalDurationById.get(section.spanId) || 0) + section.durationMs,
    );
  });

  const spanMetricsById = new Map();
  orderedSpans.forEach((span) => {
    spanMetricsById.set(span.spanId, {
      selfDurationMs: calculateSelfDuration(span, childrenById.get(span.spanId) || []),
      criticalDurationMs: criticalDurationById.get(span.spanId) || 0,
    });
  });

  const slowCandidates = [];
  const errorCandidates = [];
  const serviceStatsByKey = new Map();
  const operationStatsByKey = new Map();
  const stack = [];
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    stack.push({ span: roots[index], parentPath: null });
  }

  while (stack.length) {
    const { span, parentPath } = stack.pop();
    const pathNode = {
      value: span.name || span.spanId || '',
      parent: parentPath,
      depth: parentPath ? parentPath.depth + 1 : 1,
    };
    const metrics = spanMetricsById.get(span.spanId);
    const row = { span, ...metrics, pathNode };
    slowCandidates.push(row);
    if (isErrorSpan(span)) errorCandidates.push(row);

    const service = span.service || '';
    const operation = span.name || '';
    updateStats(
      serviceStatsByKey,
      service,
      { service },
      span,
      metrics,
      spanMetricsById,
    );
    updateStats(
      operationStatsByKey,
      `${service}\0${operation}`,
      { service, operation },
      span,
      metrics,
      spanMetricsById,
    );

    const children = childrenById.get(span.spanId) || [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ span: children[index], parentPath: pathNode });
    }
  }

  slowCandidates.sort((left, right) => right.selfDurationMs - left.selfDurationMs
    || durationOf(right.span) - durationOf(left.span)
    || compareSpans(left.span, right.span));
  errorCandidates.sort((left, right) => compareSpans(left.span, right.span));
  const slowSpans = attachLazyPaths(slowCandidates.slice(0, 20));
  const errorSpans = attachLazyPaths(errorCandidates);

  return {
    spans: orderedSpans,
    byId,
    parentById,
    childrenById,
    roots,
    traceStart,
    traceEnd,
    durationMs: Math.max(0, traceEnd - traceStart),
    criticalSections,
    criticalSpanIds,
    spanMetricsById,
    slowSpans,
    errorSpans,
    serviceStats: sortStats([...serviceStatsByKey.values()], ['service']),
    operationStats: sortStats([...operationStatsByKey.values()], ['service', 'operation']),
  };
}

function toSet(value) {
  if (value instanceof Set) return value;
  return new Set(Array.isArray(value) ? value : []);
}

export function buildVisibleTraceRows(
  analysis,
  { collapsedSpanIds, query, services, errorsOnly } = {},
) {
  if (!analysis || !Array.isArray(analysis.spans)) {
    return { rows: [], matchingSpanIds: [] };
  }

  const normalizedQuery = String(query ?? '').trim().toLowerCase();
  const serviceFilter = toSet(services);
  const collapsed = toSet(collapsedSpanIds);
  const filtersActive = Boolean(normalizedQuery || serviceFilter.size || errorsOnly);
  const matches = filtersActive
    ? analysis.spans.filter((span) => spanMatchesQuery(span, normalizedQuery)
      && (!serviceFilter.size || serviceFilter.has(span.service))
      && (!errorsOnly || isErrorSpan(span)))
    : [];
  const matchingSpanIds = matches.map((span) => span.spanId);
  const matchingSet = new Set(matchingSpanIds);
  const visibleIds = new Set();
  const parentById = analysis.parentById || new Map();

  matches.forEach((span) => {
    let currentId = span.spanId;
    while (currentId != null) {
      if (visibleIds.has(currentId)) break;
      visibleIds.add(currentId);
      currentId = parentById.get(currentId);
    }
  });

  const rows = [];
  const stack = [];
  for (let index = analysis.roots.length - 1; index >= 0; index -= 1) {
    stack.push({ span: analysis.roots[index], depth: 0 });
  }

  while (stack.length) {
    const { span, depth } = stack.pop();
    if (filtersActive && !visibleIds.has(span.spanId)) continue;

    const children = analysis.childrenById.get(span.spanId) || [];
    const visibleChildren = filtersActive
      ? children.filter((child) => visibleIds.has(child.spanId))
      : children;
    rows.push({
      span,
      depth,
      hasChildren: visibleChildren.length > 0,
      isMatch: matchingSet.has(span.spanId),
    });

    if (filtersActive || !collapsed.has(span.spanId)) {
      for (let index = visibleChildren.length - 1; index >= 0; index -= 1) {
        stack.push({ span: visibleChildren[index], depth: depth + 1 });
      }
    }
  }

  return { rows, matchingSpanIds };
}
