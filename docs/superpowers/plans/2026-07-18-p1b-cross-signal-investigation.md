# P1-B Cross-Signal Investigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve time and entity context while operators move among Trace, Span, Log, Metrics, and Service Map, and make “similar Trace”/Metrics drill-down match the intended service Span rather than only the root Operation.

**Architecture:** The backend adds one typed same-Span selector to the existing grouped Trace query without changing root filter semantics. The frontend extends P1-A’s pure `investigationContext` module into the only destination adapter, restores URL time ranges through one Hook, and renders page-specific actions that consume the shared builder instead of assembling query strings locally.

**Tech Stack:** Java 17, Spring Boot 3.5, MyBatis, ClickHouse, React 18, React Router 6, Ant Design 5, Node built-in test runner, Maven, real Chrome acceptance.

## Global Constraints

- P1-A must be green and free of Critical/Important findings before this plan begins.
- Preserve existing meanings: `service` = Trace contains service, `operation` = root Operation, `status` = whole Trace status.
- New same-Span selector is optional and must not alter SQL when absent.
- All investigation URLs keep valid `from/to`; do not introduce a second time-range state outside AppContext.
- Use shared pure URL adapters; pages must not hand-build parallel parameter rules.
- Do not add Trace Compare, topology redesign, import/export, storage objects, dependencies, or a global state library.
- All code attribution remains `Quasar`.
- Preserve `.impeccable/` and all accepted P0/P1-A changes.
- Current execution does not authorize stage, commit, push, deploy, or target-environment performance tests.
- Maven commands must use `mvn -s "$env:MAVEN_HOME\conf\settings.xml"` from `platform`.

---

### Task 1: Typed Same-Span Selector in Trace Search

**Files:**
- Create: `platform/quasar-tracing-common/src/main/java/org/quasar/tracing/common/dto/TraceSpanSelectorDTO.java`
- Modify: `platform/quasar-tracing-server/src/main/java/org/quasar/tracing/server/controller/TraceController.java`
- Modify: `platform/quasar-tracing-core/src/main/java/org/quasar/tracing/core/service/TraceService.java`
- Modify: `platform/quasar-tracing-clickhouse/src/main/java/org/quasar/tracing/clickhouse/mapper/TraceSearchFilter.java`
- Modify: `platform/quasar-tracing-clickhouse/src/main/resources/mapper/TraceMapper.xml`
- Modify: `platform/quasar-tracing-server/src/test/java/org/quasar/tracing/server/controller/TraceControllerSearchTest.java`
- Modify: `platform/quasar-tracing-core/src/test/java/org/quasar/tracing/core/service/TraceServiceSearchTest.java`

**Interfaces:**
- Produces: optional API params `spanService`, `spanOperation`, `spanStatus`.
- Produces: `TraceSpanSelectorDTO(service, operation, status)` or `null` when all fields are absent.
- `status` normalized to `error|ok`; any other nonblank value throws `InvalidQueryException`.
- Produces: `TraceSearchFilter.spanSelector` consumed by the shared Mapper body.

- [ ] **Step 1: Write controller and service red tests**

Controller test must call:

```java
mvc.perform(get("/api/traces")
        .param("spanService", "checkout")
        .param("spanOperation", "POST /orders")
        .param("spanStatus", "error"))
    .andExpect(status().isOk());
```

Verify a selector with the exact three values reaches `TraceService`. Add `spanStatus=unknown` and expect HTTP 400 with no Mapper call.

Service test must capture `TraceSearchFilter` and assert:

- all absent -> `spanSelector == null`;
- values are trimmed;
- uppercase `ERROR` normalizes to `error`;
- unknown status throws `InvalidQueryException`.

- [ ] **Step 2: Run focused tests and verify red**

Run:

```powershell
mvn -s "$env:MAVEN_HOME\conf\settings.xml" -pl quasar-tracing-server -am "-Dtest=TraceControllerSearchTest,TraceServiceSearchTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

Expected: FAIL because selector fields/signatures do not exist.

- [ ] **Step 3: Implement the selector contract and normalization**

Use a Lombok DTO:

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TraceSpanSelectorDTO {
    private String service;
    private String operation;
    private String status;
}
```

`TraceService` builds `null` when all normalized fields are blank. It must not translate selector fields into the existing root `operation` or whole-Trace `status`.

- [ ] **Step 4: Add one same-Span countIf block**

In the shared `searchBody`:

```xml
<if test="spanSelector != null">
    AND countIf(
        1 = 1
        <if test="spanSelector.service != null and spanSelector.service != ''">
            AND ServiceName = #{spanSelector.service}
        </if>
        <if test="spanSelector.operation != null and spanSelector.operation != ''">
            AND SpanName = #{spanSelector.operation}
        </if>
        <if test="spanSelector.status == 'error'">
            AND StatusCode = 'Error'
        </if>
        <if test="spanSelector.status == 'ok'">
            AND StatusCode != 'Error'
        </if>
    ) > 0
</if>
```

Keep this separate from Attribute `countIf`; P1-B does not redefine cross-feature same-row coupling between selector fields and Attribute conditions.

- [ ] **Step 5: Run focused and full backend tests**

Run:

```powershell
mvn -s "$env:MAVEN_HOME\conf\settings.xml" -pl quasar-tracing-server -am "-Dtest=TraceControllerSearchTest,TraceServiceSearchTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
mvn -s "$env:MAVEN_HOME\conf\settings.xml" test
```

Expected: PASS.

- [ ] **Step 6: Verify same-Span semantics locally**

Seed one Trace with the requested service/operation/status on one Span and a second Trace where those values are split across Spans. Query the API.

Expected: only the first Trace is returned, and `data.total` equals records.

- [ ] **Step 7: Commit checkpoint — skip in current execution**

After separate authorization only:

```powershell
git add platform
git commit -m "feat: add trace span selector"
```

---

### Task 2: Shared Investigation Destination Adapter

**Files:**
- Modify: `control-panel/src/utils/investigationContext.js`
- Modify: `control-panel/src/utils/investigationContext.test.js`
- Modify: `control-panel/src/hooks/useInvestigationRange.js`
- Modify: `control-panel/src/pages/TraceSearch/TraceSearchPage.jsx`
- Modify: `control-panel/src/pages/LogSearch/LogSearchPage.jsx`
- Modify: `control-panel/src/pages/Metrics/MetricsPage.jsx`
- Modify: `control-panel/src/pages/ServiceMap/ServiceMapPage.jsx`

**Interfaces:**
- Produces: `buildInvestigationPath(destination, context): string`.
- Destinations: `traces|logs|metrics|services`.
- Produces: `readInvestigationRange(searchParams): { from, to } | null`.
- `useInvestigationRange(searchParams): effectiveRange` is reused by all four target pages.

- [ ] **Step 1: Write destination mapping tests**

Use one complete context and assert exact query entries, not only string containment:

```js
const context = {
  from: 1000,
  to: 2000,
  service: 'checkout',
  serviceInstanceId: 'checkout-7f9',
  operation: 'POST /orders',
  environment: 'production',
  namespace: 'quasar',
  traceId: 'trace-1',
  spanId: 'span-1',
};

assert.deepEqual(entries(buildInvestigationPath('traces', context)), {
  from: '1000',
  to: '2000',
  spanService: 'checkout',
  spanOperation: 'POST /orders',
});
```

Assert Logs uses trace/span/service, Metrics uses resource dimensions, Services uses `focus`, and every target carries valid `from/to`. Test invalid destination and malformed ranges.

- [ ] **Step 2: Run frontend tests and verify red**

Run:

```powershell
npm --prefix control-panel run test:control-panel
```

Expected: FAIL because the generic adapter is missing.

- [ ] **Step 3: Implement the pure destination adapter**

Use one fixed adapter table or switch. Append only non-empty values with `URLSearchParams`; never concatenate raw `?key=value` strings.

For Trace targets, add `spanStatus=error` only when `context.spanStatus === 'error'`. Do not map a non-error Span to `spanStatus=ok` unless the caller explicitly requests it.

- [ ] **Step 4: Reuse the range Hook on all target pages**

Call `useInvestigationRange(searchParams)` in Trace Search, Log Search, Metrics, and Service Map. Use the returned normalized `effectiveRange` for each page's first and subsequent requests; the Hook also synchronizes AppContext so TopBar remains the visible owner.

The Hook must compare numeric range values before setting context so it cannot cause a request/render loop or issue an initial request with the stale pre-navigation range.

- [ ] **Step 5: Run tests and build**

Run:

```powershell
npm --prefix control-panel run test:control-panel
npm --prefix control-panel run build
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint — skip in current execution**

After separate authorization only:

```powershell
git add control-panel/src/utils/investigationContext* control-panel/src/hooks/useInvestigationRange.js control-panel/src/pages
git commit -m "feat: preserve investigation context"
```

---

### Task 3: Span Investigation Actions

**Files:**
- Create: `control-panel/src/components/SpanInvestigationActions.jsx`
- Modify: `control-panel/src/components/SpanDetailDrawer.jsx`
- Modify: `control-panel/src/pages/TraceDetail/TraceDetailPage.jsx`
- Modify: `control-panel/src/utils/investigationContext.js`
- Modify: `control-panel/src/utils/investigationContext.test.js`
- Modify: `control-panel/src/i18n/locales/en.js`
- Modify: `control-panel/src/i18n/locales/zh-CN.js`
- Modify: `control-panel/src/styles/global.css`

**Interfaces:**
- Consumes: selected Span, Trace summary, and `buildInvestigationPath()`.
- Produces actions: Span Logs, Service Metrics, Locate in Topology, Similar Traces.
- The action component receives complete target paths and disabled reasons; it does not read router/AppContext directly.

- [ ] **Step 1: Add context derivation tests**

Add a pure `spanInvestigationContext(span, summary, now)` helper. Assert it selects resource dimensions using this precedence:

```text
span.resourceAttributes
  -> summary direct fields
  -> undefined
```

Map keys exactly:

- `service.instance.id`
- `deployment.environment.name`
- `service.namespace`, falling back to `k8s.namespace.name`

Assert Error Span produces `spanStatus=error`; non-error leaves it undefined.

- [ ] **Step 2: Implement the presentational action component**

Render four small Buttons with existing Ant icons. Required fields:

- Logs: traceId and spanId.
- Metrics: service.
- Topology: service.
- Similar Traces: service and operation.

Disabled buttons have a tooltip explaining the missing correlation field. Buttons wrap under 768px.

- [ ] **Step 3: Wire TraceDetailPage**

Compute context with `useMemo` from selected Span and the trace-tagged data already guarded by P0. Build all four paths in the page and pass them to `SpanDetailDrawer`/actions.

Do not add API calls. Opening/closing the Drawer must not reset the Timeline filters.

- [ ] **Step 4: Preserve the P1-A Attribute shortcut**

Refactor P1-A’s Attribute shortcut to call the generic `buildInvestigationPath('traces', { from: context.from, to: context.to, attributeConditions: [condition] })`. Extend the Trace adapter to serialize Attribute conditions through `traceSearchParams`, not a second JSON implementation. Do not add service/operation to this shortcut: its contract is “find this Attribute value,” and selector/Attribute blocks are intentionally independent.

- [ ] **Step 5: Add bilingual copy and responsive CSS**

Provide exact action labels, missing-field tooltips, and Attribute search labels in English/Chinese. Avoid icon-only buttons without accessible names.

- [ ] **Step 6: Run tests/build**

Run:

```powershell
npm --prefix control-panel run test:control-panel
npm --prefix control-panel run build
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Commit checkpoint — skip in current execution**

After separate authorization only:

```powershell
git add control-panel/src/components control-panel/src/pages/TraceDetail control-panel/src/utils control-panel/src/i18n control-panel/src/styles/global.css
git commit -m "feat: add span investigation actions"
```

---

### Task 4: Metrics, Service Map, Log, and Related Logs Links

**Files:**
- Modify: `control-panel/src/pages/Metrics/MetricsPage.jsx`
- Modify: `control-panel/src/pages/ServiceMap/ServicePanel.jsx`
- Modify: `control-panel/src/pages/LogSearch/LogDetailDrawer.jsx`
- Modify: `control-panel/src/pages/TraceDetail/RelatedLogs.jsx`
- Modify: `control-panel/src/pages/TraceDetail/TraceDetailPage.jsx`
- Modify: `control-panel/src/i18n/locales/en.js`
- Modify: `control-panel/src/i18n/locales/zh-CN.js`
- Modify: `control-panel/src/styles/global.css`

**Interfaces:**
- Consumes: `buildInvestigationPath()` and current AppContext range.
- Metrics Endpoint Trace path must use `spanService/spanOperation`, never root `operation`.
- Existing Related Logs scope semantics remain unchanged.

- [ ] **Step 1: Replace Metrics hand-built search paths**

Delete the local `buildSearchPath` helper after all callers move to the shared adapter.

Endpoint Trace action context:

```js
{
  from: range.from,
  to: range.to,
  service,
  operation: row.operation,
  serviceInstanceId: selectedInstanceId === 'all' ? undefined : selectedInstanceId,
  environment: requestedEnvironment,
  namespace: requestedNamespace,
}
```

Expected Trace URL contains `spanService` and `spanOperation`, not `operation`.

- [ ] **Step 2: Add Service Map Trace/Log actions**

In `ServicePanel`, use the passed `range` and focused service:

- Trace -> `traces` destination.
- Logs -> `logs` destination.
- Metrics -> replace the current literal URL with `metrics` destination.

Keep upstream/downstream traversal unchanged.

- [ ] **Step 3: Add Log Detail Metrics/Topology actions**

Use `useApp().range` and the selected log’s service/resource fields. Preserve the existing Trace button. Do not enable Span Attribute query on Log AttributeTable.

- [ ] **Step 4: Refactor Related Logs open action**

Pass the trace-derived investigation window from TraceDetailPage into RelatedLogs. Build the Log Search path through the shared adapter while preserving Trace/Span scope selection.

- [ ] **Step 5: Add bilingual labels and mobile wrapping**

All new buttons must have text labels at desktop and remain keyboard accessible/mobile hittable. Do not create a second global action toolbar.

- [ ] **Step 6: Run frontend gates**

Run:

```powershell
npm --prefix control-panel run test:control-panel
npm --prefix control-panel run build
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Commit checkpoint — skip in current execution**

After separate authorization only:

```powershell
git add control-panel/src/pages control-panel/src/i18n control-panel/src/styles/global.css
git commit -m "feat: connect investigation workflows"
```

---

### Task 5: P1-B and Full P1 Acceptance

**Files:**
- Modify/Create ignored acceptance harness under `output/playwright/`
- Review all P1 files listed by `git status --short`

**Interfaces:**
- Consumes all P1-A/P1-B capabilities.
- Produces browser evidence and a final review verdict; no production source interface.

- [ ] **Step 1: Run all automated gates**

Run:

```powershell
npm --prefix control-panel run test:control-panel
npm --prefix control-panel run build
mvn -s "$env:MAVEN_HOME\conf\settings.xml" test
git diff --check
```

Expected: all PASS; only the existing Vite chunk-size warning is allowed.

- [ ] **Step 2: Run real-browser cross-signal acceptance**

Using deterministic Trace/Log/Metrics/Service Map fixtures, assert:

- Span four-action paths and disabled states;
- Error Span includes `spanStatus=error`, non-error does not;
- Trace Attribute shortcut still works after generic adapter refactor;
- target pages restore `from/to` after direct navigation and reload;
- Metrics Endpoint Trace request uses `spanService/spanOperation`;
- ServicePanel exposes Trace/Log/Metrics with correct service/range;
- Log Detail exposes Trace/Metrics/Topology without Attribute shortcut;
- Related Logs preserves trace/span scope;
- browser back/forward preserves target filters;
- desktop and 390px mobile controls are visible, non-overlapping, and hit-testable;
- zero page, console, request, unexpected API, and non-2xx errors.

- [ ] **Step 3: Regression-test P0 Trace workbench**

Re-run the existing 301-Span fixture: search, filters, virtualization, minimap, zoom, Diagnostics, Statistics, Related Logs, Drawer and mobile tick overlap. P1 must not regress P0.

- [ ] **Step 4: Inspect local server lifecycle**

Acceptance helper must leave port 5173 clear. After all review gates, start one intentional hidden Vite dev server and verify HTTP 200 for user inspection.

- [ ] **Step 5: Final code review**

Review the full diff against:

- `docs/superpowers/specs/2026-07-18-p1-advanced-query-investigation-design.md`
- P1-A plan
- this P1-B plan

Do not declare completion with any remaining Critical/Important finding. Re-run affected unit/build/browser gates after every accepted fix.

- [ ] **Step 6: Commit checkpoint — skip in current execution**

After separate authorization only:

```powershell
git add control-panel platform docs/superpowers
git commit -m "feat: complete p1 investigation workflow"
```
