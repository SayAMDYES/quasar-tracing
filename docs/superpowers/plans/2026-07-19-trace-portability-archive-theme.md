# Trace Portability, Archive, and Dark Theme Implementation Plan

> **Execution gate:** This plan is for a later implementation session after external approval. The current design session must not modify production code, stage, commit, push, or deploy.

**Goal:** Deliver Trace JSON/export, file import, Trace Compare, bounded search-result download, ClickHouse Archive, and a complete light/dark/system theme as six independently acceptable stages.

**Architecture:** Introduce a versioned `TraceDocumentDTO` as the shared normalized model for storage-backed traces and browser-imported traces. Keep Compare and bounded export orchestration in pure frontend modules, keep Archive in dedicated Spring/MyBatis/ClickHouse boundaries, and make one ThemeProvider drive Ant Design, CSS variables, and ECharts.

**Tech Stack:** Java 17, Spring Boot 3.5, Jackson, MyBatis, ClickHouse, React 18, React Router 6, Ant Design 5, ECharts 5, Node built-in test runner, Maven.

## Global Constraints

- Implementation baseline is `master@98651e17426d650af87f599263b0053c46004638`.
- Follow `docs/superpowers/specs/2026-07-19-trace-portability-archive-theme-design.md` exactly.
- Do not label any generated JSON as raw OTLP, raw payload, unadjusted OTLP, or lossless OTLP.
- Do not add authentication, authorization, audit users, object storage, a task queue, or a new database.
- Do not change the OTel Collector ingestion path or the live `spans` schema.
- Keep existing Trace APIs backward compatible; all new `source` parameters are optional.
- Keep Archive disabled by default until both DDL variants are installed.
- Bind all client strings, IDs, times and Attribute values. Never accept a table name or SQL fragment from the client. The existing sanitized `${limit}` / `${offset}` pattern is allowed only after `QueryProperties` clamps non-negative integers.
- All code attribution must use `Quasar`.
- Maven commands run from `platform` with `mvn -s "$env:MAVEN_HOME\conf\settings.xml" ...`.
- Each stage has its own acceptance gate. Do not start the next stage while the current gate is red.
- Commit, push, and deployment require separate authorization; this plan contains no automatic Git checkpoint.

## Stage 1: Trace Document v1, JSON View, and Single Export

### Task 1: Freeze the Java Document Contract

**Files:**

- Create: `platform/quasar-tracing-common/src/main/java/org/quasar/tracing/common/dto/TraceDocumentDTO.java`
- Create: `platform/quasar-tracing-common/src/main/java/org/quasar/tracing/common/dto/TraceDocumentRootDTO.java`
- Create: `platform/quasar-tracing-common/src/main/java/org/quasar/tracing/common/dto/TraceDocumentSpanDTO.java`
- Create: `platform/quasar-tracing-common/src/main/java/org/quasar/tracing/common/dto/TraceDocumentStatusDTO.java`
- Create: `platform/quasar-tracing-common/src/main/java/org/quasar/tracing/common/dto/TraceDocumentScopeDTO.java`
- Create: `platform/quasar-tracing-common/src/main/java/org/quasar/tracing/common/dto/TraceDocumentEventDTO.java`
- Create: `platform/quasar-tracing-common/src/main/java/org/quasar/tracing/common/dto/TraceDocumentLinkDTO.java`
- Create: `platform/quasar-tracing-common/src/main/java/org/quasar/tracing/common/dto/TraceDocumentWarningDTO.java`
- Create: `platform/quasar-tracing-common/src/main/java/org/quasar/tracing/common/dto/TraceSource.java`
- Modify: `platform/quasar-tracing-common/src/test/java/org/quasar/tracing/common/dto/DtoSerializationTest.java`
- Add: `platform/quasar-tracing-common/src/test/resources/trace-document-v1-golden.json`

**Steps:**

- [ ] Write shared golden fixtures first for natural root, multiple roots, missing parent and parent cycle. Assert exact property order, decimal-string Long fields, root selection, warnings, empty collection behavior, sorted maps, UTF-8 and LF output.
- [ ] Add DTOs with explicit `@JsonPropertyOrder`; do not reuse `SpanDTO` because its timestamp is milliseconds and it omits stored fields.
- [ ] Represent `startTimeUnixNano` and `durationNano` as String in the public DTO.
- [ ] Keep Attribute values as String and collections non-null.
- [ ] Add Trace ID and Span ID normalization helpers in common code, accepting only 32/16 lowercase hexadecimal output.
- [ ] Add one canonical topology helper that computes `min(start)`, `max(start+duration)-min(start)`, natural/orphan/cycle candidates, deterministic cycle representatives and the primary root without mutating stored parent IDs.
- [ ] Run:

```powershell
mvn -s "$env:MAVEN_HOME\conf\settings.xml" -pl quasar-tracing-common test
```

Expected: all common tests pass and the generated fixture equals the checked-in golden file byte-for-byte.

### Task 2: Read Every Stored Span Field

**Files:**

- Modify: `platform/quasar-tracing-clickhouse/src/main/java/org/quasar/tracing/clickhouse/entity/SpanEntity.java`
- Modify: `platform/quasar-tracing-clickhouse/src/main/java/org/quasar/tracing/clickhouse/mapper/SpanMapper.java`
- Modify: `platform/quasar-tracing-clickhouse/src/main/resources/mapper/SpanMapper.xml`
- Reuse `StringListTypeHandler` and `MapListTypeHandler` for Link arrays; add distinct nanosecond string aliases for scalar/event timestamps without changing the existing millisecond fields
- Create: `platform/quasar-tracing-clickhouse/src/test/java/org/quasar/tracing/clickhouse/mapper/SpanMapperDocumentTest.java`

**Steps:**

- [ ] Add a mapper contract test that requires TraceState, ScopeName, ScopeVersion, event arrays and all link arrays.
- [ ] Extend `selectByTraceId` without changing current aliases consumed by `TraceService.detail()`.
- [ ] Convert ClickHouse DateTime64(9) to Unix nanosecond decimal strings for the Document path; do not derive nanoseconds from the existing millisecond DTO.
- [ ] Validate parallel Event and Link arrays have equal lengths. Mapping inconsistencies must fail document generation with a stable internal error, not silently truncate.
- [ ] Keep current detail tests green.
- [ ] Run:

```powershell
mvn -s "$env:MAVEN_HOME\conf\settings.xml" -pl quasar-tracing-clickhouse,quasar-tracing-core -am test
```

### Task 3: Add the Document Service and API

**Files:**

- Create: `platform/quasar-tracing-core/src/main/java/org/quasar/tracing/core/service/TraceDocumentService.java`
- Create: `platform/quasar-tracing-core/src/main/java/org/quasar/tracing/core/exception/TraceDocumentTooLargeException.java`
- Create: `platform/quasar-tracing-server/src/main/java/org/quasar/tracing/server/controller/TraceDocumentController.java`
- Modify: `platform/quasar-tracing-server/src/main/java/org/quasar/tracing/server/advice/GlobalExceptionHandler.java`
- Create: `platform/quasar-tracing-core/src/test/java/org/quasar/tracing/core/service/TraceDocumentServiceTest.java`
- Create: `platform/quasar-tracing-server/src/test/java/org/quasar/tracing/server/controller/TraceDocumentControllerTest.java`

**Interfaces:**

- `TraceDocumentService.get(traceId, source): TraceDocumentDTO`
- `GET /api/traces/{traceId}/document?source=auto|live|archive`
- HTTP 413 with code/message for `TRACE_DOCUMENT_TOO_LARGE`

**Steps:**

- [ ] Write service tests for nanosecond preservation, stable sorting, map sorting, Source handling, invalid IDs, missing Trace, zero Span, 20,000-Span limit, multiple natural roots, missing parents, self-cycle and multi-Span cycles.
- [ ] Assert Trace start/duration use the full Span envelope rather than selected root duration and match the shared golden fixtures.
- [ ] Implement only `live` and `auto -> live` in Stage 1. Accept `archive` but return feature-disabled until Stage 5.
- [ ] Create Document solely through `TraceDocumentService`; controller must not assemble fields.
- [ ] Add controller tests for default source, explicit live, invalid source, 404 and 413.
- [ ] Run:

```powershell
mvn -s "$env:MAVEN_HOME\conf\settings.xml" -pl quasar-tracing-server -am "-Dtest=TraceDocumentServiceTest,TraceDocumentControllerTest,TraceControllerDetailTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

### Task 4: Add the Frontend Canonicalizer

**Files:**

- Create: `control-panel/src/utils/traceDocument.js`
- Create: `control-panel/src/utils/traceDocument.test.js`
- Create: `control-panel/src/workers/traceWorker.js`
- Create: `control-panel/src/workers/traceWorkerClient.js`
- Modify: `control-panel/src/api/index.js`
- Modify: `control-panel/package.json`

**Steps:**

- [ ] Add golden tests for canonical ordering, decimal strings, missing collections, invalid version and deterministic output under shuffled input.
- [ ] Implement `normalizeTraceDocument`, `createTraceBundle`, and `stableStringifyTraceBundle` as pure functions.
- [ ] Add a request-ID worker protocol with `canonicalize` as the first operation; worker errors return stable code/message and never a stack trace or input payload.
- [ ] Add `fetchTraceDocument(traceId, source)` without passing Document decimal strings through Number revival.
- [ ] Update `test:control-panel` to include the new test explicitly.
- [ ] Run:

```powershell
npm run test:control-panel
```

### Task 5: Add Virtualized JSON View and Single Export

**Files:**

- Create: `control-panel/src/components/JsonDocumentViewer.jsx`
- Create: `control-panel/src/pages/TraceDetail/TraceJsonPanel.jsx`
- Modify: `control-panel/src/pages/TraceDetail/TraceDetailPage.jsx`
- Modify: `control-panel/src/i18n/locales/en.js`
- Modify: `control-panel/src/i18n/locales/zh-CN.js`
- Modify: `control-panel/src/styles/global.css`

**Steps:**

- [ ] Add pure segment-index tests for unwrapped lines, wrapped Unicode code points, search-offset mapping, resize re-segmentation and overscan. Assert rendered segment count remains bounded for generated 50 MiB and 100 MiB canonical strings.
- [ ] Add a JSON tab that lazily loads the Document only when selected.
- [ ] Display the normalized-not-raw warning permanently above the viewer.
- [ ] Add copy, download, text search and wrap controls with icons and tooltips. Wrap mode must split logical lines into fixed-height visual segments in the Worker; do not use variable-height `pre-wrap` rows.
- [ ] Create single export through the canonical Bundle function and revoke Object URLs after click.
- [ ] Enforce shared Bundle limits: 100 MiB UTF-8, 100 Trace, 20,000 Span per Trace and 50,000 total Span. Measure final Blob bytes before download.
- [ ] Verify a maximum-size single export passes the Stage 1 canonical Bundle validator and final byte limit; full importer round-trip is gated in Task 6 after the importer exists.
- [ ] Run Node tests and `npm run build`.

**Stage 1 acceptance:** backend tests pass; JSON tab works on a real Trace; downloaded JSON is canonical v1; no UI text calls it raw OTLP.

## Stage 2: Browser File Import

### Task 6: Implement Import Parsing and Jaeger Conversion

**Files:**

- Create: `control-panel/src/utils/traceImport.js`
- Create: `control-panel/src/utils/traceImport.test.js`
- Add: `control-panel/src/utils/__fixtures__/quasar-trace-bundle-v1.json`
- Add: `control-panel/src/utils/__fixtures__/jaeger-query-trace.json`
- Add malformed and limit fixtures kept small through generated test data

**Steps:**

- [ ] Write tests for all accepted wrappers: Quasar Bundle, Jaeger single Trace, array, `{data: trace}`, `{data: [trace]}`.
- [ ] Write rejection tests for unknown Quasar version, OTLP `resourceSpans`, Zipkin shape, JSONL, duplicate Trace ID, no spans and mismatched Jaeger process references.
- [ ] Test shared 100 MiB, 100 Trace, 20,000 Span per Trace and 50,000 total Span boundaries without checking in giant fixtures.
- [ ] Test `partial=true` rejects the whole Bundle with `PARTIAL_BUNDLE_NOT_IMPORTABLE`; test `partial=false` plus non-empty failures rejects with `INVALID_BUNDLE_FAILURES`.
- [ ] Add maximum-size single and maximum 100-Trace/50,000-Span/100-MiB batch export -> import -> re-export tests. Compare exact canonical `traces[]`; allow regenerated `generatedAt` and generator version.
- [ ] Implement per-Trace isolation: no partial Span acceptance.
- [ ] Add `import` to the shared Trace Worker and keep the parser usable directly in Node tests.
- [ ] Add table-driven Jaeger conversion tests covering 16/32 Trace IDs, short Span ID padding, duplicate normalized IDs, traceID conflict, CHILD_OF/FOLLOWS_FROM priority, multiple parents, cross-trace Links and unknown reference types.
- [ ] Add tests for missing process/service, service.name conflicts, microsecond BigInt conversion, operationName, scalar/duplicate/conflicting tags, span.kind, status/error conflicts, logs/events, warnings and unknown fields.
- [ ] Use the shared canonical topology fixtures after Jaeger conversion so imported root/start/duration/warnings match live/archive rules.
- [ ] Return `{accepted, rejected, warnings}` with stable path-aware errors and no raw file echo.
- [ ] Run the focused Node test.

### Task 7: Add the In-Memory Imported Trace Repository

**Files:**

- Create: `control-panel/src/context/ImportedTraceContext.jsx`
- Create: `control-panel/src/hooks/useTraceSource.js`
- Modify: `control-panel/src/main.jsx`
- Modify: `control-panel/src/App.jsx`
- Create: `control-panel/src/pages/TraceImport/TraceImportPage.jsx`
- Modify: `control-panel/src/layouts/AppLayout.jsx`
- Modify translations and CSS

**Steps:**

- [ ] Implement an in-memory repository keyed by random session IDs; add tests proving no local/session storage writes occur.
- [ ] Add a Trace Import page with drag/drop and file picker, not an upload-to-server API.
- [ ] Show accepted/rejected counts and per-Trace failure summaries.
- [ ] Add route `/traces/imported/:sessionId` that reuses Trace Detail presentation through a source-aware hook.
- [ ] On missing session data, show an explicit expired-import state and never query live by the same Trace ID.
- [ ] Allow imported Trace JSON view and re-export.
- [ ] Run Node tests and build.

**Stage 2 acceptance:** both supported formats load; all platform-generated non-partial v1 Bundles round-trip; partial v1 is rejected; maximum 100-Trace/50,000-Span/100-MiB batch export -> import -> re-export preserves canonical `traces[]`; imported data disappears on refresh and is never sent to the backend.

## Stage 3: Trace Compare

### Task 8: Implement the Deterministic Diff Engine

**Files:**

- Create: `control-panel/src/utils/traceCompare.js`
- Create: `control-panel/src/utils/traceCompare.test.js`

**Steps:**

- [ ] Write tests first for virtual root, structural signatures, repeated siblings, orphan spans, shuffled input, added/removed nodes and malformed cycles.
- [ ] Test duration/self-duration deltas, `null` percent for zero baseline, 1 ms + 10% regression threshold, status, Attribute and Event changes.
- [ ] Ignore IDs and absolute timestamps in changed classification.
- [ ] Implement `buildTraceComparison(a, b)` as a pure function returning summary deltas, merged tree rows and per-Span detail diffs.
- [ ] Add `compare` to the shared Trace Worker; the React page must not execute the 30,000-Span diff on the main thread.
- [ ] Add a 15,000 + 15,000 Span synthetic performance test with a documented local time budget; fail immediately above 30,000 combined.
- [ ] Run the focused Node test.

### Task 9: Add Compare Selection and Page

**Files:**

- Create: `control-panel/src/pages/TraceCompare/TraceComparePage.jsx`
- Create: `control-panel/src/pages/TraceCompare/TraceCompareSummary.jsx`
- Create: `control-panel/src/pages/TraceCompare/TraceCompareTree.jsx`
- Create: `control-panel/src/pages/TraceCompare/TraceCompareDrawer.jsx`
- Modify: `control-panel/src/pages/TraceSearch/TraceSearchPage.jsx`
- Modify: `control-panel/src/pages/TraceDetail/TraceDetailPage.jsx`
- Modify: `control-panel/src/App.jsx`
- Modify translations and CSS

**Steps:**

- [ ] Add a controlled selection column with a strict maximum of two Trace refs.
- [ ] Add baseline/candidate actions and route `/traces/compare?a=...&b=...`.
- [ ] Resolve live refs through the Document API and import refs through the in-memory repository.
- [ ] Add swap, open-source, summary cards, required filters and merged diff tree.
- [ ] Add a side-by-side detail drawer with Attribute/Event key diffs.
- [ ] Mark imported comparisons as current-session-only; refresh must show the expired source explicitly.
- [ ] Verify route back/forward and shareability for two live refs.

**Stage 3 acceptance:** alignment tests are deterministic; real Trace Compare, swap, filters and URL refresh work; no compare backend API exists.

## Stage 4: Trace Search Result Download

### Task 10: Implement the Bounded Download Pool

**Files:**

- Create: `control-panel/src/utils/downloadPool.js`
- Create: `control-panel/src/utils/downloadPool.test.js`
- Modify: `control-panel/src/api/client.js` only if AbortSignal is not already forwarded

**Steps:**

- [ ] Use a fake requester to prove active requests never exceed four.
- [ ] Test 15-second timeout, one retry for network/429/502/503/504, jitter injection, no retry for other 4xx and AbortController cancellation.
- [ ] Test stable progress, all-fail, partial-fail and success ordering.
- [ ] Keep retry policy data-driven and independent from React.

### Task 11: Integrate Result Download into Trace Search

**Files:**

- Create: `control-panel/src/components/TraceResultsDownload.jsx`
- Modify: `control-panel/src/pages/TraceSearch/TraceSearchPage.jsx`
- Modify: `control-panel/src/api/index.js`
- Modify translations and CSS

**Steps:**

- [ ] Snapshot the currently applied request, force `limit=100&offset=0`, and keep current sort/order.
- [ ] Deduplicate returned Trace IDs while preserving order.
- [ ] Show “first 100” before download when total exceeds 100.
- [ ] Fetch Documents through the pool and stop with no file at 50,000 Span or estimated 100 MiB.
- [ ] Add progress and cancel controls.
- [ ] For partial failure, require an explicit confirmation before creating `partial=true` Bundle with sanitized failures.
- [ ] Never silently omit a 404 or failed Trace.
- [ ] Run Node tests and build.

**Stage 4 acceptance:** concurrency/retry/cancel tests pass; a real download handles success and injected partial failure exactly as specified.

## Stage 5: ClickHouse Archive

### Task 12: Add Archive DDL in Both Deployment Modes

**Files:**

- Create: `deploy/simple/sql/10_trace_archive.sql`
- Create: `deploy/helm/quasar-tracing/files/sql/10_trace_archive.sql`
- Verify only: `deploy/helm/quasar-tracing/templates/configmaps.yaml` already loads `files/sql/*.sql`; no template edit is required
- Create: `platform/quasar-tracing-clickhouse/src/test/java/org/quasar/tracing/clickhouse/schema/ArchiveSchemaParityTest.java`

**Steps:**

- [ ] Write a parity test that normalizes comments/whitespace and compares the two DDL files; fail if either Archive table uses `ReplacingMergeTree` or an engine other than plain `MergeTree`.
- [ ] Create append-only `trace_archive_manifest` exactly as the specification, including `Revision` and `RevisionId`; preserve every state row until TTL and never delegate latest-state selection to the table engine.
- [ ] Create append-only `trace_archive_spans` with plain `MergeTree` by explicitly listing every current `spans` column plus Generation/ArchivedAt/ExpiresAt. Do not use `AS spans` because indexes, codecs and future drift must remain reviewable; the engine must not deduplicate `(TraceId, ArchiveGeneration, SpanId)` rows.
- [ ] Add all fixed indexes and TTL expressions from the spec.
- [ ] Verify DDL in a disposable ClickHouse instance before touching any shared environment.

### Task 13: Add Archive Configuration, Entities, and Mapper

**Files:**

- Create: `platform/quasar-tracing-core/src/main/java/org/quasar/tracing/core/config/ArchiveProperties.java`
- Modify: `platform/quasar-tracing-server/src/main/resources/application.yml`
- Create archive manifest/entity classes in `quasar-tracing-clickhouse`
- Create: `platform/quasar-tracing-clickhouse/src/main/java/org/quasar/tracing/clickhouse/mapper/TraceArchiveMapper.java`
- Create: `platform/quasar-tracing-clickhouse/src/main/resources/mapper/TraceArchiveMapper.xml`
- Create mapper tests

**Steps:**

- [ ] Test defaults: disabled, 180 days, 20,000 Span; reject retention outside 30–3650.
- [ ] Add one shared `latestArchiveManifest` fragment using cross-partition `argMax(tuple(...), tuple(Revision, UpdatedAt, RevisionId))`; active lookup, idempotency, status, Search, Detail, document and DELETE must all reuse it.
- [ ] In a disposable ClickHouse integration test, insert unexpired concurrent manifest rows with the same TraceId, Revision and UpdatedAt but different RevisionId values, assert the largest RevisionId wins, record physical row count and latest result, run `OPTIMIZE TABLE trace_archive_manifest FINAL`, and assert both remain unchanged; repeat the assertion around a background merge.
- [ ] Apply logical expiry after latest selection, so expired ACTIVE is ABSENT even before TTL merge; test Revision increment and UInt64 exhaustion.
- [ ] Add fixed mapper methods for next Revision across all partitions, generation insert/readback, active manifest insert, tombstone insert, best-effort generation cleanup and archive Search/Detail reads.
- [ ] Add a test that fails if any latest-state query uses `FINAL`.
- [ ] Keep live/archive table choices in explicit XML branches; never use `${table}`. Only clamped integer pagination may use the existing `${limit}` / `${offset}` workaround.
- [ ] Make archive reads select only the latest ACTIVE generation.
- [ ] Add SQL-shape tests for bound Trace IDs and source filters.

### Task 14: Implement the Archive State Machine

**Files:**

- Create: `platform/quasar-tracing-core/src/main/java/org/quasar/tracing/core/service/TraceArchiveService.java`
- Create Archive status/result DTOs in `quasar-tracing-common`
- Create: `platform/quasar-tracing-core/src/test/java/org/quasar/tracing/core/service/TraceArchiveServiceTest.java`
- Modify: `TraceDocumentService` to read archive source

**Steps:**

- [ ] Write tests for disabled behavior, first archive 201, idempotent repeat 200, missing live 404, max Span rejection and immutable snapshot behavior.
- [ ] Simulate span insert failure, count mismatch and manifest failure. No incomplete generation may become visible.
- [ ] After insert, rebuild the canonical Document from that exact Archive Generation and require both SpanCount and SHA-256 to equal the pre-insert source snapshot before ACTIVE.
- [ ] Verify a valid Generation has identical row count and canonical SHA-256 before and after `OPTIMIZE TABLE trace_archive_spans FINAL`; inject duplicate and conflicting `(TraceId, ArchiveGeneration, SpanId)` rows and assert they remain visible and prevent ACTIVE rather than being engine-deduplicated.
- [ ] Simulate a late Span entering between source snapshot and `INSERT SELECT`, a source change during the write, and a corrupted archived field. Each must fail verification with no ACTIVE manifest.
- [ ] Simulate two concurrent archive requests; only one latest ACTIVE generation may be returned.
- [ ] Compute SHA-256 from canonical Document bytes before the manifest insert.
- [ ] Write a higher-Revision tombstone and test immediate logical absence; physical mutation remains best-effort and is not observable through API state.
- [ ] Test cross-month ACTIVE -> DELETED -> re-Archive ACTIVE. All read paths must return only the highest `(Revision, UpdatedAt, RevisionId)` state.
- [ ] Repeat delete returns 204, no polling state exists, cleanup targets only the deleted Generation, and live/newly re-archived rows remain untouched.
- [ ] Extend Document `source=auto|archive` tests.

### Task 15: Add Archive APIs and Source-Aware Search

**Files:**

- Create: `platform/quasar-tracing-server/src/main/java/org/quasar/tracing/server/controller/TraceArchiveController.java`
- Create controller tests
- Modify: `TraceController.java`
- Modify: `TraceService.java`
- Modify Trace search filter/mapper DTOs and tests for fixed `source`

**Steps:**

- [ ] Add POST/status/DELETE endpoints with exact HTTP 201/200/204/404 behavior. DELETE returns 204 after tombstone verification; there is no 202/DELETING contract.
- [ ] Add `GET /api/archive/capabilities` and test disabled/enabled retention/max-Span values.
- [ ] Add `source` to Search/Detail without changing absent-parameter behavior.
- [ ] Keep Search default live; do not union live/archive.
- [ ] Apply `from/to` to original archived Trace start time.
- [ ] Reuse same-Span Attribute filtering against archived spans after resolving ACTIVE generation.
- [ ] Run `EXPLAIN indexes = 1` for archive Search and TraceId detail on representative generated data.
- [ ] Run full Maven tests.

### Task 16: Add Archive UI

**Files:**

- Create: `control-panel/src/components/TraceArchiveAction.jsx`
- Create: `control-panel/src/components/TraceSourceSelector.jsx`
- Modify Trace Search and Trace Detail pages
- Modify API wrappers, translations and CSS

**Steps:**

- [ ] Hide Archive actions when feature status reports disabled.
- [ ] Add Archive confirmation and idempotent success state.
- [ ] Add live/archive source selector; default live on Search and auto on Detail.
- [ ] Show source and ArchivedAt badges.
- [ ] Add delete confirmation explicitly stating live Trace is unaffected.
- [ ] After DELETE 204, remove the Archive from UI immediately and show completion; do not poll mutation progress or expose mutation IDs.
- [ ] Run Node tests, build and disposable-environment browser verification.

**Stage 5 acceptance:** DDL parity with plain append-only `MergeTree` for both tables, cross-partition latest-state selection, invariant manifest latest result and Archive Generation checksum before/after background merge or `OPTIMIZE`, source/archive checksum equality before activation, idempotency, invisible partial writes, cross-month delete/re-archive, 180-day ExpiresAt, source Search/Detail and immediate tombstone deletion all pass; live ingestion remains unchanged.

## Stage 6: Light, Dark, and System Theme

### Task 17: Add Theme Storage and Provider

**Files:**

- Create: `control-panel/src/theme/themeStorage.js`
- Create: `control-panel/src/theme/themeStorage.test.js`
- Create: `control-panel/src/context/ThemeContext.jsx`
- Modify: `control-panel/index.html`
- Modify: `control-panel/src/main.jsx`
- Modify: `control-panel/src/layouts/AppLayout.jsx`

**Steps:**

- [ ] Test valid/invalid storage, blocked storage, system fallback and media changes only in system mode.
- [ ] Add the pre-React bootstrap that sets `data-theme` and `color-scheme` without rendering visible UI.
- [ ] Add ThemeProvider with `system|light|dark` preference and effective mode.
- [ ] Add an icon menu in the header for all three choices.
- [ ] Ensure no listener leak under React StrictMode.

### Task 18: Split Runtime Tokens and AntD Theme

**Files:**

- Modify: `control-panel/src/theme/tokens.js`
- Modify: `control-panel/src/theme/antdTheme.js`
- Modify: `control-panel/src/styles/global.css`
- Modify components/pages containing hard-coded light surface/text colors

**Steps:**

- [ ] Preserve the current light token values exactly.
- [ ] Add complete dark canvas/surface/border/text/status/palette tokens.
- [ ] Replace root-only variables with light and `html[data-theme='dark']` blocks.
- [ ] Convert AntD config to `createAntdTheme(mode, tokens)` using default/dark algorithms.
- [ ] Audit hard-coded `#FFFFFF`, light grey backgrounds and rgba masks with `rg`; replace only UI colors, not data payload examples.
- [ ] Verify AntD portal components: Modal, Drawer, Dropdown, Tooltip, Notification, Table filters and DatePicker.

### Task 19: Make ECharts Runtime-Theme Aware

**Files:**

- Modify: `control-panel/src/components/EChart.jsx`
- Modify: `control-panel/src/charts/options.js`
- Modify every page that builds ECharts options
- Add chart theme tests

**Steps:**

- [ ] Add tests that light/dark option builders produce different text, axis, split, tooltip, legend, loading-mask and graph-label colors.
- [ ] Consume effective mode in `EChart`; dispose and re-init on mode change while preserving event handlers and ResizeObserver cleanup.
- [ ] Replace static chart color constants with a runtime `chartTheme` argument or option factory.
- [ ] Recompute page options when effective mode changes.
- [ ] Verify reduced-motion behavior remains unchanged.

### Task 20: Theme and Full Regression Gate

**Files:**

- Modify test scripts only where needed to include every new Node test
- No production feature expansion

**Steps:**

- [ ] Run all frontend Node tests.
- [ ] Run `npm run build`.
- [ ] Run full Platform Maven tests.
- [ ] Run `git diff --check`.
- [ ] Use Playwright against a local/disposable stack at 390x844, 768x1024 and 1440x1000 in light and dark.
- [ ] Capture Trace Search, JSON, Import, Compare, Archive, Metrics, Service Map and Log Search screenshots.
- [ ] Assert no overlap, no page-level horizontal scroll, no blank canvas, and browser console 0 errors.
- [ ] Verify system theme live change, explicit preference persistence and no first-paint flash.
- [ ] Verify WCAG AA contrast for normal text and 3:1 for critical non-text controls.

**Stage 6 acceptance:** AntD, CSS and every ECharts surface switch together; system and stored preference semantics match the spec; all earlier stages remain green in both themes.

## Final Review Checklist

- [ ] No UI or API calls normalized JSON raw OTLP.
- [ ] Bundle schema/version and golden fixture are unchanged after Stage 1 acceptance; every non-partial producer output is importer-compatible under the shared limits.
- [ ] Import never sends file contents to the server or browser storage.
- [ ] Compare alignment is deterministic and does not use Span IDs.
- [ ] Search download never exceeds 100 Trace, concurrency 4, 50,000 Span or 100 MiB; maximum non-partial batch round-trips through importer.
- [ ] Partial export requires explicit user confirmation and records failures.
- [ ] Both Archive tables use append-only plain `MergeTree`; no engine-level replacement or deduplication can alter manifest latest state or Generation checksum before versus after merge/`OPTIMIZE`.
- [ ] Archive manifest latest state is selected across all partitions only through the shared `argMax` rule and without `FINAL`; partial or checksum-mismatched generations are invisible.
- [ ] Archive repeat/delete/re-archive/live-source semantics match the spec; DELETE has no DELETING state or UI polling.
- [ ] simple and Helm Archive DDL are identical.
- [ ] Archive remains disabled by default before migration.
- [ ] Theme preference, effective mode, AntD, CSS and ECharts remain one coherent state.
- [ ] No authentication, commit, push or deployment work has been added to the implementation scope.
