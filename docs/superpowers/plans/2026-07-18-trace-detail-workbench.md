# Trace Detail Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing trace detail page from a basic waterfall viewer into a focused diagnostic workbench with scalable navigation, critical-path analysis, slow/error diagnosis, and service/operation statistics.

**Architecture:** Keep the backend and `GET /api/traces/{traceId}` contract unchanged. Add one pure JavaScript analysis module that normalizes the span tree and computes all derived results once, then let the waterfall, diagnostics, and statistics components consume that shared immutable result. Implement fixed-row virtualization locally with the existing 34 px row contract and render the minimap on `<canvas>` so large traces do not recreate the original full-DOM bottleneck.

**Tech Stack:** React 18, Ant Design 5, Vite 5, JavaScript ES modules, Node built-in test runner, Python Playwright for browser acceptance.

## Global Constraints

- Work only on branch `codex/trace-detail-workbench`.
- Do not change backend APIs, ClickHouse queries, trace DTOs, log behavior, metrics behavior, service-map behavior, authentication, deployment files, or release metadata.
- Do not add a runtime or test dependency; use `node:test` and the existing React/Ant Design stack.
- Preserve the existing Span drawer, related-log behavior, bilingual UI, global time range, and the current `--wf-row-h: 34px` layout contract.
- Use `Quasar` for all code attribution and do not add AI-related attribution.
- Do not modify or delete the existing untracked `.impeccable/` directory.
- Do not create nested cards. Diagnostics and statistics render as unframed content inside the existing trace-detail card.
- Use existing theme tokens, `serviceColor()`, `formatDuration()`, `ServiceBadge`, `SpanStatusTag`, and Ant Design icons rather than new visual conventions.
- Keep query typing responsive with `useDeferredValue`; build `Map` and `Set` indexes once per trace analysis rather than performing repeated array scans during render.
- Do not commit, push, or deploy in this execution. Each task ends at a commit authorization gate and records only a suggested future commit message.

---

## File Map

- Create `control-panel/src/utils/traceAnalysis.js`: pure span-tree normalization, filtering, critical-path sections, self-time calculation, slow/error findings, and grouped statistics.
- Create `control-panel/src/utils/traceAnalysis.test.js`: deterministic Node tests for tree, filtering, malformed spans, critical path, interval union, and aggregation.
- Modify `control-panel/package.json`: add only the `test:trace` script.
- Create `control-panel/src/components/TraceWaterfallToolbar.jsx`: search, match navigation, service/error filters, critical-path toggle, and reset command.
- Create `control-panel/src/components/TraceMinimap.jsx`: canvas overview and visible-time-range selection.
- Modify `control-panel/src/components/TraceWaterfall.jsx`: consume shared analysis, apply filters, virtualize rows, clip bars to the selected time range, and expose search navigation.
- Create `control-panel/src/pages/TraceDetail/TraceDiagnostics.jsx`: critical-path summary, slow spans, and error-path inspection.
- Create `control-panel/src/pages/TraceDetail/TraceStatistics.jsx`: service and operation aggregations.
- Modify `control-panel/src/pages/TraceDetail/TraceDetailPage.jsx`: compute analysis once and add the Diagnostics and Statistics tabs.
- Modify `control-panel/src/i18n/locales/zh-CN.js`: Chinese workbench labels.
- Modify `control-panel/src/i18n/locales/en.js`: English workbench labels.
- Modify `control-panel/src/styles/global.css`: toolbar, minimap, virtual rows, critical-path, diagnostics, statistics, and responsive layout styles.
- Create ignored `output/playwright/check-trace-workbench.py`: deterministic mocked-API browser acceptance script.

---

### Task 1: Build The Pure Trace Analysis Model

**Files:**
- Create: `control-panel/src/utils/traceAnalysis.js`
- Create: `control-panel/src/utils/traceAnalysis.test.js`
- Modify: `control-panel/package.json`

**Interfaces:**
- Consumes: span objects returned by `fetchTrace(traceId)`, using `spanId`, `parentSpanId`, `name`, `service`, `timestamp`, `durationMs`, `durationNs`, `statusCode`, `statusMessage`, `resourceAttributes`, `spanAttributes`, and `events`.
- Produces: `createTraceAnalysis(spans)` returning `{ spans, byId, childrenById, roots, traceStart, traceEnd, durationMs, criticalSections, criticalSpanIds, spanMetricsById, slowSpans, errorSpans, serviceStats, operationStats }`.
- Produces: `buildVisibleTraceRows(analysis, { collapsedSpanIds, query, services, errorsOnly })` returning `{ rows, matchingSpanIds }`, where every row is `{ span, depth, hasChildren, isMatch }`.
- Produces: `spanMatchesQuery(span, normalizedQuery)` for search across span/service/status text, resource attributes, span attributes, event names, and event attributes.

- [ ] **Step 1: Add the failing Node tests**

Create `control-panel/src/utils/traceAnalysis.test.js` with this fixture shape and assertions:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVisibleTraceRows,
  createTraceAnalysis,
  spanMatchesQuery,
} from './traceAnalysis.js';

function makeSpan(overrides = {}) {
  const timestamp = overrides.timestamp ?? 0;
  const durationMs = overrides.durationMs ?? 10;
  return {
    spanId: overrides.spanId ?? 'span',
    parentSpanId: overrides.parentSpanId ?? '',
    name: overrides.name ?? 'operation',
    service: overrides.service ?? 'service-a',
    timestamp,
    durationMs,
    durationNs: durationMs * 1e6,
    statusCode: overrides.statusCode ?? 'Ok',
    statusMessage: overrides.statusMessage ?? '',
    resourceAttributes: overrides.resourceAttributes ?? {},
    spanAttributes: overrides.spanAttributes ?? {},
    events: overrides.events ?? [],
  };
}

test('normalizes roots and keeps orphan spans visible', () => {
  const analysis = createTraceAnalysis([
    makeSpan({ spanId: 'root', durationMs: 100 }),
    makeSpan({ spanId: 'child', parentSpanId: 'root', timestamp: 10 }),
    makeSpan({ spanId: 'orphan', parentSpanId: 'missing', timestamp: 20 }),
  ]);
  assert.deepEqual(analysis.roots.map((span) => span.spanId), ['root', 'orphan']);
  assert.equal(analysis.childrenById.get('root')[0].spanId, 'child');
});

test('matches names, services, attributes, events, and status text', () => {
  const span = makeSpan({
    name: 'SELECT orders',
    service: 'checkout-service',
    statusMessage: 'connection timeout',
    resourceAttributes: { 'k8s.pod.name': 'checkout-7f9' },
    spanAttributes: { 'db.system': 'mysql' },
    events: [{ name: 'exception', attributes: { 'exception.type': 'SocketTimeoutException' } }],
  });
  for (const query of ['orders', 'checkout', 'timeout', 'pod.name', 'mysql', 'exception', 'sockettimeout']) {
    assert.equal(spanMatchesQuery(span, query), true, query);
  }
  assert.equal(spanMatchesQuery(span, 'redis'), false);
});

test('filtered rows include ancestor context and direct matches only in matchingSpanIds', () => {
  const analysis = createTraceAnalysis([
    makeSpan({ spanId: 'root', durationMs: 100 }),
    makeSpan({ spanId: 'branch', parentSpanId: 'root', timestamp: 10, durationMs: 70 }),
    makeSpan({ spanId: 'db', parentSpanId: 'branch', timestamp: 20, name: 'SELECT orders' }),
    makeSpan({ spanId: 'other', parentSpanId: 'root', timestamp: 85 }),
  ]);
  const result = buildVisibleTraceRows(analysis, {
    collapsedSpanIds: new Set(['root']),
    query: 'orders',
    services: [],
    errorsOnly: false,
  });
  assert.deepEqual(result.rows.map((row) => row.span.spanId), ['root', 'branch', 'db']);
  assert.deepEqual(result.matchingSpanIds, ['db']);
  assert.equal(result.rows[0].isMatch, false);
  assert.equal(result.rows[2].isMatch, true);
});

test('critical path walks backward through sequential last-finishing children', () => {
  const analysis = createTraceAnalysis([
    makeSpan({ spanId: 'root', timestamp: 0, durationMs: 100 }),
    makeSpan({ spanId: 'first', parentSpanId: 'root', timestamp: 10, durationMs: 20 }),
    makeSpan({ spanId: 'last', parentSpanId: 'root', timestamp: 40, durationMs: 50 }),
  ]);
  assert.deepEqual([...analysis.criticalSpanIds].sort(), ['first', 'last', 'root']);
  assert.equal(analysis.criticalSections.reduce((sum, section) => sum + section.durationMs, 0), 100);
});

test('clips overflowing child intervals and never reports critical time outside its parent', () => {
  const analysis = createTraceAnalysis([
    makeSpan({ spanId: 'root', timestamp: 0, durationMs: 100 }),
    makeSpan({ spanId: 'overflow', parentSpanId: 'root', timestamp: 90, durationMs: 30 }),
  ]);
  assert.equal(analysis.criticalSections.every((section) => section.startTime >= 0 && section.endTime <= 100), true);
  assert.equal(analysis.criticalSections.reduce((sum, section) => sum + section.durationMs, 0), 100);
});

test('uses the union of child intervals when calculating self time', () => {
  const analysis = createTraceAnalysis([
    makeSpan({ spanId: 'root', timestamp: 0, durationMs: 100 }),
    makeSpan({ spanId: 'a', parentSpanId: 'root', timestamp: 10, durationMs: 40 }),
    makeSpan({ spanId: 'b', parentSpanId: 'root', timestamp: 30, durationMs: 40 }),
  ]);
  assert.equal(analysis.spanMetricsById.get('root').selfDurationMs, 40);
});

test('aggregates service and operation totals with error and critical counts', () => {
  const analysis = createTraceAnalysis([
    makeSpan({ spanId: 'root', service: 'api', name: 'POST /orders', durationMs: 100 }),
    makeSpan({ spanId: 'db', parentSpanId: 'root', service: 'db', name: 'INSERT', timestamp: 20, durationMs: 60, statusCode: 'Error' }),
  ]);
  const dbService = analysis.serviceStats.find((row) => row.service === 'db');
  const dbOperation = analysis.operationStats.find((row) => row.service === 'db' && row.operation === 'INSERT');
  assert.deepEqual(
    { spanCount: dbService.spanCount, errorCount: dbService.errorCount, totalDurationMs: dbService.totalDurationMs },
    { spanCount: 1, errorCount: 1, totalDurationMs: 60 },
  );
  assert.equal(dbOperation.criticalSpanCount, 1);
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```powershell
Set-Location control-panel
node --test src/utils/traceAnalysis.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `traceAnalysis.js`.

- [ ] **Step 3: Implement the pure analysis module**

Create `control-panel/src/utils/traceAnalysis.js` with these exact exports and rules:

```js
export function spanMatchesQuery(span, normalizedQuery) {}
export function createTraceAnalysis(spans = []) {}
export function buildVisibleTraceRows(analysis, options = {}) {}
```

Implementation rules:

1. Normalize invalid input to an empty array and never mutate the API span objects.
2. Build `byId` and `childrenById` with `Map`; treat a span as a root when its parent is empty, absent, self-referential, or missing from `byId`.
3. Sort roots and every child array by `timestamp`, breaking ties by `spanId` so tests and UI remain deterministic.
4. Search one lower-cased string assembled from name, service, status code/message, both attribute maps, and every event name/attribute pair. Empty query matches all spans.
5. Calculate child coverage as the union of direct-child intervals clipped to the parent interval. Store `{ selfDurationMs }` in `spanMetricsById`.
6. Calculate critical sections using the Jaeger-style last-finishing-child walk: start at each root, add the current span section after its last finishing child, recurse into that child, then walk backward to the child finishing immediately before the returning child started. Clip malformed children to the parent interval and ignore zero-length sections.
7. Derive `criticalSpanIds` from the critical sections.
8. Add `selfDurationMs`, `criticalDurationMs`, and `path` to every `slowSpans` and `errorSpans` row. Sort slow spans by self duration descending, then total duration descending; keep the first 20. Sort errors by timestamp ascending.
9. Aggregate service and operation rows in one traversal. Each row contains `spanCount`, `errorCount`, `criticalSpanCount`, `totalDurationMs`, `selfDurationMs`, `criticalDurationMs`, and `representativeSpan`; service rows use `service`, operation rows use `service` plus `operation`. `representativeSpan` is the source span with the greatest self duration, breaking ties by total duration and then timestamp.
10. `buildVisibleTraceRows()` combines query, selected services, and errors-only with AND semantics. When filters are active, include direct matches plus all ancestors and ignore collapsed state along those paths. Without filters, return the full tree while honoring `collapsedSpanIds`.

- [ ] **Step 4: Add the focused npm script and run tests**

Add this one script to `control-panel/package.json` without changing dependencies or other scripts:

```json
"test:trace": "node --test src/utils/traceAnalysis.test.js"
```

Run:

```powershell
Set-Location control-panel
npm run test:trace
```

Expected: 7 tests pass, 0 fail.

- [ ] **Step 5: Self-review Task 1 and stop at the commit authorization gate**

Run:

```powershell
git diff --check
git diff -- control-panel/package.json control-panel/src/utils/traceAnalysis.js control-panel/src/utils/traceAnalysis.test.js
```

Expected: no whitespace errors; only Task 1 files appear. Do not run `git add` or `git commit`. Suggested future commit message: `feat: add trace diagnostic analysis model`.

---

### Task 2: Add Scalable Waterfall Navigation

**Files:**
- Create: `control-panel/src/components/TraceWaterfallToolbar.jsx`
- Create: `control-panel/src/components/TraceMinimap.jsx`
- Modify: `control-panel/src/components/TraceWaterfall.jsx`
- Modify: `control-panel/src/i18n/locales/zh-CN.js`
- Modify: `control-panel/src/i18n/locales/en.js`
- Modify: `control-panel/src/styles/global.css`

**Interfaces:**
- Consumes: Task 1 `analysis` object and `buildVisibleTraceRows()`.
- Produces: `TraceWaterfallToolbar` controlled props `{ query, onQueryChange, services, serviceOptions, onServicesChange, errorsOnly, onErrorsOnlyChange, criticalPathVisible, onCriticalPathVisibleChange, matchIndex, matchCount, onPreviousMatch, onNextMatch, onReset }`.
- Produces: `TraceMinimap` props `{ rows, analysis, viewRange, criticalPathVisible, onViewRangeChange }`, where `viewRange` is `[startPercent, endPercent]`.
- Changes: `TraceWaterfall` props to `{ spans, analysis, selectedId, onSelect }`.

- [ ] **Step 1: Add bilingual control labels before rendering the controls**

Add these keys under `traceDetail` in both locale files:

```js
searchSpans: '搜索 Span、服务、属性或事件',
serviceFilter: '服务筛选',
errorsOnly: '仅错误',
criticalPath: '关键路径',
previousMatch: '上一个匹配项',
nextMatch: '下一个匹配项',
matchCount: '{{current}} / {{total}}',
noMatches: '无匹配项',
resetView: '重置视图',
timeWindow: '时间窗口',
```

Use these English values in `en.js`: `Search spans, services, attributes, or events`, `Service filter`, `Errors only`, `Critical path`, `Previous match`, `Next match`, `{{current}} / {{total}}`, `No matches`, `Reset view`, and `Time window`.

- [ ] **Step 2: Implement the controlled toolbar**

Create `TraceWaterfallToolbar.jsx` using Ant Design `Input`, multi-select `Select`, `Switch`, `Button`, `Tooltip`, and the existing icon library. Keep search input width responsive, give previous/next/reset icon buttons accessible labels, disable match navigation when `matchCount === 0`, and render `noMatches` instead of `0 / 0`.

The component must be pure and must not derive trace rows. Its command layout is:

```jsx
<div className="wf-toolbar">
  <Input allowClear value={query} onChange={...} placeholder={t('traceDetail.searchSpans')} />
  <Select mode="multiple" maxTagCount="responsive" value={services} options={serviceOptions} />
  <span className="wf-toggle"><Switch checked={errorsOnly} />...</span>
  <span className="wf-toggle"><Switch checked={criticalPathVisible} />...</span>
  <span className="wf-match-nav">...</span>
  <Tooltip title={t('traceDetail.resetView')}><Button icon={<ReloadOutlined />} /></Tooltip>
</div>
```

- [ ] **Step 3: Implement the canvas minimap and range control**

Create `TraceMinimap.jsx` with a wrapper `<div className="wf-minimap">`, one `<canvas>`, a viewport overlay, and an Ant Design range `Slider`. Use `ResizeObserver` to size the canvas to its CSS width and device-pixel ratio. Draw each visible row as a one-pixel minimum horizontal bar using the existing `serviceColor(span.service)`; import `status as statusColors` from `@/theme/tokens`, draw errors with `statusColors.error`, and draw critical spans with `statusColors.warn` when enabled.

Clamp `viewRange` so `0 <= start < end <= 100` and enforce a minimum 2% window. Clicking the minimap recenters the current window without changing its width. The slider is the only range-drag implementation; do not add custom pointer-drag state.

- [ ] **Step 4: Refactor and virtualize `TraceWaterfall`**

Replace the local `buildRows()` implementation with `buildVisibleTraceRows(analysis, filters)`. Use this state contract:

```jsx
const [collapsed, setCollapsed] = useState(() => new Set());
const [query, setQuery] = useState('');
const deferredQuery = useDeferredValue(query);
const [services, setServices] = useState([]);
const [errorsOnly, setErrorsOnly] = useState(false);
const [criticalPathVisible, setCriticalPathVisible] = useState(true);
const [viewRange, setViewRange] = useState([0, 100]);
const [matchIndex, setMatchIndex] = useState(0);
const [scrollTop, setScrollTop] = useState(0);
```

Memoize filtered rows from primitive filter dependencies. Reset `matchIndex` to zero when the matching ID list changes. Previous/next navigation wraps, selects the matched span, and scrolls its virtual row into the vertical center.

Implement fixed-height virtualization with `ROW_HEIGHT = 34`, `OVERSCAN = 8`, the body `clientHeight`, and an absolutely positioned inner space:

```jsx
const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
const endIndex = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
const virtualRows = rows.slice(startIndex, endIndex);
```

Render `.wf-virtual-space` at `rows.length * ROW_HEIGHT` and position each rendered row with `transform: translateY(index * ROW_HEIGHT)`. Use an ordinary React `onScroll` handler; do not install global scroll or wheel listeners.

Clip each bar to the selected horizontal time window. A span outside the window remains in the tree but renders no bar; a partially overlapping span renders only its visible interval. Axis ticks display absolute offsets within the selected window. Add `is-critical` and `is-match` classes without replacing the existing error and selected classes.

- [ ] **Step 5: Add focused responsive styles**

Extend the existing Trace waterfall section in `global.css`:

- `.wf-toolbar` uses a responsive flex/grid layout and never makes the page wider than its parent.
- `.wf-minimap` has a stable 64 px canvas region plus the range slider.
- `.wf-body` remains 560 px maximum height and becomes the virtual scroll viewport.
- `.wf-virtual-space` is `position: relative`; virtual rows are `position: absolute; left: 0; right: 0`.
- `.wf-row.is-match` gets a restrained highlight; `.wf-bar.is-critical` gets a distinct 2 px outline that remains distinguishable from `.is-error`.
- At widths below 768 px, reduce `--wf-label-w` to 210 px and allow toolbar controls to wrap without overlapping.

- [ ] **Step 6: Run focused tests and build**

Run:

```powershell
Set-Location control-panel
npm run test:trace
npm run build
```

Expected: 7 trace-analysis tests pass; Vite build succeeds. The existing large-chunk warning is acceptable; new compile, lint-like, or missing-i18n errors are not.

- [ ] **Step 7: Self-review Task 2 and stop at the commit authorization gate**

Run `git diff --check` and inspect only the Task 2 files plus the already accepted Task 1 files. Confirm native buttons are not nested and every icon-only command has a tooltip and accessible label. Do not commit. Suggested future commit message: `feat: improve trace waterfall navigation`.

---

### Task 3: Add Diagnostics And Statistics Views

**Files:**
- Create: `control-panel/src/pages/TraceDetail/TraceDiagnostics.jsx`
- Create: `control-panel/src/pages/TraceDetail/TraceStatistics.jsx`
- Modify: `control-panel/src/pages/TraceDetail/TraceDetailPage.jsx`
- Modify: `control-panel/src/i18n/locales/zh-CN.js`
- Modify: `control-panel/src/i18n/locales/en.js`
- Modify: `control-panel/src/styles/global.css`

**Interfaces:**
- Consumes: Task 1 `analysis`; existing `formatDuration`, `ServiceBadge`, and `SpanStatusTag`.
- Produces: `TraceDiagnostics({ analysis, onSelectSpan })`.
- Produces: `TraceStatistics({ analysis, onSelectSpan })`.
- Changes: `TraceDetailPage` computes `analysis = useMemo(() => createTraceAnalysis(data?.spans || []), [data?.spans])` once and passes it to all three trace-workbench views.

- [ ] **Step 1: Add bilingual diagnostics and statistics labels**

Add exact Chinese keys under `traceDetail`: `tabDiagnostics: '诊断'`, `tabStatistics: '统计'`, `criticalShare: '关键路径占比'`, `errorSpans: '错误 Span'`, `slowestSpan: '最慢自耗时 Span'`, `bottleneckService: '主要耗时服务'`, `slowSpanTitle: '慢 Span'`, `errorPathTitle: '错误路径'`, `spanPath: '调用路径'`, `selfDuration: '自耗时'`, `criticalDuration: '关键路径耗时'`, `criticalSpanCount: '关键 Span 数'`, `serviceStatistics: '服务统计'`, and `operationStatistics: 'Operation 统计'`.

Add direct English equivalents: `Diagnostics`, `Statistics`, `Critical path share`, `Error spans`, `Slowest self-time span`, `Primary bottleneck service`, `Slow spans`, `Error paths`, `Call path`, `Self time`, `Critical-path time`, `Critical spans`, `Service statistics`, and `Operation statistics`.

- [ ] **Step 2: Implement the diagnostics view**

Create `TraceDiagnostics.jsx` as unframed content with one compact `.trace-diagnostic-summary` band followed by two small Ant Design tables.

Derive the four summary values without additional traversal:

```js
const criticalDurationMs = analysis.criticalSections.reduce((sum, item) => sum + item.durationMs, 0);
const criticalShare = analysis.durationMs > 0 ? Math.min(1, criticalDurationMs / analysis.durationMs) : 0;
const slowest = analysis.slowSpans[0];
const bottleneck = analysis.serviceStats.reduce(
  (best, row) => (!best || row.selfDurationMs > best.selfDurationMs ? row : best),
  null,
);
```

The slow-span table shows operation, service, total duration, self duration, and a critical-path marker. The error-path table shows operation, service, status, call path, and duration. Rows are keyboard accessible; Enter or Space invokes `onSelectSpan(record.span)` and opens the existing drawer. Empty tables use the project translation for empty state and do not invent explanatory marketing copy.

- [ ] **Step 3: Implement the statistics view**

Create `TraceStatistics.jsx` with an internal Ant Design `Tabs` switch between service and operation tables. Do not wrap the tables in cards.

Service columns: service, span count, error count, total duration, self duration, critical-path duration, critical span count. Operation columns: operation, service, and the same metrics. Default sorts: service rows by self duration descending; operation rows by total duration descending. Clicking a row invokes `onSelectSpan(record.representativeSpan)` using the representative selected by Task 1.

- [ ] **Step 4: Integrate the shared analysis into Trace Detail**

In `TraceDetailPage.jsx`:

1. Import `createTraceAnalysis`, `TraceDiagnostics`, and `TraceStatistics`.
2. Compute analysis once with `useMemo` after data loads.
3. Pass `analysis` into `TraceWaterfall`.
4. Insert tabs in this order: Timeline, Diagnostics, Statistics, Related Logs.
5. Reuse `setSelected` for rows selected from all views, keeping `SpanDetailDrawer` as the only detail surface.
6. Keep related-log fetching, badge count, PageHeader, summary metrics, and back navigation unchanged.

The final tab contract is:

```jsx
[
  { key: 'timeline', children: <TraceWaterfall spans={data.spans} analysis={analysis} selectedId={selected?.spanId} onSelect={setSelected} /> },
  { key: 'diagnostics', children: <TraceDiagnostics analysis={analysis} onSelectSpan={setSelected} /> },
  { key: 'statistics', children: <TraceStatistics analysis={analysis} onSelectSpan={setSelected} /> },
  { key: 'logs', children: <RelatedLogs traceId={traceId} logs={logs} selectedSpan={selected} /> },
]
```

- [ ] **Step 5: Add responsive diagnostics/statistics styles**

Add stable summary tracks using CSS grid with `repeat(auto-fit, minmax(150px, 1fr))`. Keep headings compact, ensure long operation and path values ellipsize with a title tooltip, and configure table horizontal scroll rather than allowing columns to overlap on mobile.

- [ ] **Step 6: Run focused tests and build**

Run:

```powershell
Set-Location control-panel
npm run test:trace
npm run build
```

Expected: all trace-analysis tests pass and Vite build succeeds with no new warnings beyond the existing chunk-size warning.

- [ ] **Step 7: Self-review Task 3 and stop at the commit authorization gate**

Run `git diff --check`. Verify the tab order, both locale files contain identical key sets, no nested cards were introduced, and no backend file changed. Do not commit. Suggested future commit message: `feat: add trace diagnostics and statistics`.

---

### Task 4: Verify The Complete Workbench In A Real Browser

**Files:**
- Create ignored verification artifact: `output/playwright/check-trace-workbench.py`
- Create ignored screenshots: `output/playwright/trace-workbench-desktop.png`, `output/playwright/trace-workbench-mobile.png`
- Modify production files only when the acceptance script demonstrates a concrete defect.

**Interfaces:**
- Consumes: Vite dev server at `http://127.0.0.1:5173` and Playwright route interception.
- Produces: deterministic browser assertions for four tabs, filtering, match navigation, virtualization, diagnostics, statistics, drawer selection, responsive layout, and console cleanliness.

- [ ] **Step 1: Inspect the bundled server helper usage**

Run before reading helper source:

```powershell
python "C:\Users\Quasar\.cc-switch\skills\webapp-testing\scripts\with_server.py" --help
```

Expected: usage text describing `--server`, `--port`, and the command after `--`.

- [ ] **Step 2: Create a deterministic Playwright acceptance script**

Create `output/playwright/check-trace-workbench.py`. It must:

1. Launch Chromium headlessly.
2. Intercept `/api/traces/demo-trace` and `/api/traces/demo-trace/logs`.
3. Return a `QTResponse` envelope containing one 20-second root span and at least 300 deterministic child spans across `api`, `database`, and `payment` services, with several errors, attributes, events, sequential critical children, and overlapping children.
4. Open `/traces/demo-trace`, wait for `networkidle`, and assert Timeline, Diagnostics, Statistics, and Related Logs tabs are visible.
5. Assert the DOM contains fewer `.wf-row` elements than the 301 total spans while `.wf-virtual-space` is taller than the viewport.
6. Fill the Span search with `database`, assert a non-zero match counter, invoke next match, and assert a selected row appears.
7. Enable Errors only and verify every direct match is an error while ancestor context remains visible.
8. Open Diagnostics, assert slow-span and error-path sections render, activate one row, and assert the existing Span drawer opens.
9. Open Statistics and assert both service and Operation table tabs contain data.
10. Capture a 1440x1000 desktop screenshot and a 390x844 mobile screenshot.
11. Fail on uncaught page errors or unexpected console errors.

Use `page.get_by_role()` or explicit CSS classes discovered after `networkidle`; do not depend on a single UI language for every selector.

- [ ] **Step 3: Run the browser acceptance through the helper**

Run from the repository root:

```powershell
python "C:\Users\Quasar\.cc-switch\skills\webapp-testing\scripts\with_server.py" --server "npm --prefix control-panel run dev -- --host 127.0.0.1" --port 5173 -- python output/playwright/check-trace-workbench.py
```

Expected: all assertions pass, both screenshots are nonblank, and the helper stops the Vite server after the script exits.

- [ ] **Step 4: Inspect screenshots and correct only demonstrated defects**

Inspect both images. Reject the implementation if controls overlap, text escapes its parent, the minimap is blank, row selection is incoherent, the mobile table breaks page width, or the waterfall viewport shifts height during interaction. Route any correction back to the Task 2 or Task 3 implementer, then rerun the focused tests, build, and Playwright script.

- [ ] **Step 5: Run final repository verification**

Run:

```powershell
git diff --check
rtk git status --short
Set-Location control-panel
npm run test:trace
npm run build
```

Expected: only the plan and scoped control-panel files are modified; `.impeccable/` remains untouched; ignored `output/` artifacts do not enter Git status; tests and build pass.

- [ ] **Step 6: Stop at the final authorization gate**

Do not stage, commit, push, deploy, or merge. Report the changed files, test/build/browser results, screenshot paths, remaining risks, and the suggested commit breakdown from Tasks 1-3.
