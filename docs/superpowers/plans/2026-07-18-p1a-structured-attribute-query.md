# P1-A Structured Attribute Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe Resource/Span Attribute conditions to Trace Search, with same-Span AND semantics, shareable URL state, Span Attribute shortcuts, and no storage-schema change.

**Architecture:** The React filter builder serializes at most five normalized conditions into the `attributes` query parameter. Spring parses and validates the JSON into a shared DTO, the core service carries it through `TraceSearchFilter`, and MyBatis selects only fixed Resource/Span Map expressions while binding every key and value. A small investigation-window utility makes Attribute shortcuts shareable and becomes the foundation consumed by P1-B.

**Tech Stack:** Java 17, Spring Boot 3.5, Jackson, MyBatis, ClickHouse Map columns, React 18, React Router 6, Ant Design 5, Node built-in test runner, Maven.

## Global Constraints

- Scope is P1-A only; do not add P1-B page actions except the minimal Trace Search time-window foundation required by the Span Attribute shortcut.
- Keep `GET /api/traces`; new `attributes` is optional and absence must preserve current SQL behavior.
- Support only `resource|span`, `equals|contains|exists`, AND, same-Span matching, and at most five conditions.
- Never interpolate user-controlled scope, operator, key, or value with MyBatis `${}`.
- Do not add tables, materialized views, projections, indexes, dependencies, or a free-text query language.
- All code attribution remains `Quasar`.
- Preserve the existing untracked `.impeccable/` directory and P0 worktree changes.
- Current execution is implementation-only: do not stage, commit, push, deploy, or run target-environment performance tests without separate authorization.
- Maven commands must use `mvn -s "$env:MAVEN_HOME\conf\settings.xml"` from `platform`.

---

### Task 1: Attribute Contract, Parser, and HTTP 400 Boundary

**Files:**
- Create: `platform/quasar-tracing-common/src/main/java/org/quasar/tracing/common/dto/TraceAttributeConditionDTO.java`
- Create: `platform/quasar-tracing-core/src/main/java/org/quasar/tracing/core/exception/InvalidQueryException.java`
- Create: `platform/quasar-tracing-server/src/main/java/org/quasar/tracing/server/query/TraceAttributeConditionParser.java`
- Create: `platform/quasar-tracing-server/src/test/java/org/quasar/tracing/server/query/TraceAttributeConditionParserTest.java`
- Modify: `platform/quasar-tracing-server/src/main/java/org/quasar/tracing/server/advice/GlobalExceptionHandler.java`
- Modify: `platform/quasar-tracing-server/src/test/java/org/quasar/tracing/server/controller/TraceControllerSearchTest.java`

**Interfaces:**
- Produces: `TraceAttributeConditionDTO(scope, key, operator, value)` with Lombok getters/setters and constructors.
- Produces: `TraceAttributeConditionParser.parse(String raw): List<TraceAttributeConditionDTO>`.
- Produces: `InvalidQueryException`, mapped to HTTP 400 and `QTResponse.fail(400, message)`.
- Consumes: Jackson `ObjectMapper` already provided by Spring Boot.

- [ ] **Step 1: Write parser failure and normalization tests**

Create tests for empty input, a valid mixed-scope array, malformed JSON, six conditions, unknown scope/operator, blank/long key, missing/long value, `exists` with value, and duplicate normalized conditions. The valid assertion must be concrete:

```java
List<TraceAttributeConditionDTO> result = parser.parse("""
    [
      {"scope":" RESOURCE ","key":" db.system ","operator":"EQUALS","value":"mysql"},
      {"scope":"span","key":"error.type","operator":"exists"}
    ]
    """);

assertThat(result).extracting(
    TraceAttributeConditionDTO::getScope,
    TraceAttributeConditionDTO::getKey,
    TraceAttributeConditionDTO::getOperator,
    TraceAttributeConditionDTO::getValue
).containsExactly(
    tuple("resource", "db.system", "equals", "mysql"),
    tuple("span", "error.type", "exists", null)
);
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```powershell
mvn -s "$env:MAVEN_HOME\conf\settings.xml" -pl quasar-tracing-server -am "-Dtest=TraceAttributeConditionParserTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

Expected: FAIL because the DTO, parser, and exception do not exist.

- [ ] **Step 3: Implement the DTO, parser, and exception**

The DTO must be a plain shared carrier:

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TraceAttributeConditionDTO {
    private String scope;
    private String key;
    private String operator;
    private String value;
}
```

The parser must enforce these exact constants and normalize into new DTO instances:

```java
private static final int MAX_RAW_LENGTH = 4096;
private static final int MAX_CONDITIONS = 5;
private static final int MAX_KEY_LENGTH = 128;
private static final int MAX_VALUE_LENGTH = 512;
private static final Set<String> SCOPES = Set.of("resource", "span");
private static final Set<String> OPERATORS = Set.of("equals", "contains", "exists");
```

Use `TypeReference<List<TraceAttributeConditionDTO>>`, reject `null` list elements, trim scope/operator/key, preserve Value verbatim, convert empty `exists` Value to `null`, and reject duplicates using a separator-safe tuple object or record rather than concatenated strings.

- [ ] **Step 4: Map InvalidQueryException to HTTP 400**

Add a dedicated handler before the generic handler:

```java
@ExceptionHandler(InvalidQueryException.class)
@ResponseStatus(HttpStatus.BAD_REQUEST)
public QTResponse<Void> invalidQuery(InvalidQueryException e) {
    return QTResponse.fail(HttpStatus.BAD_REQUEST.value(), e.getMessage());
}
```

Extend `TraceControllerSearchTest` with malformed `attributes` acceptance after Task 2 wires the parser. For now the parser unit tests are the green gate.

- [ ] **Step 5: Run tests and verify green**

Run the focused Maven command from Step 2.

Expected: PASS.

- [ ] **Step 6: Commit checkpoint — skip in current execution**

After separate commit authorization only:

```powershell
git add platform/quasar-tracing-common platform/quasar-tracing-core platform/quasar-tracing-server
git commit -m "feat: validate trace attribute conditions"
```

---

### Task 2: Same-Span Attribute Query Plumbing

**Files:**
- Modify: `platform/quasar-tracing-server/src/main/java/org/quasar/tracing/server/controller/TraceController.java`
- Modify: `platform/quasar-tracing-core/src/main/java/org/quasar/tracing/core/service/TraceService.java`
- Modify: `platform/quasar-tracing-clickhouse/src/main/java/org/quasar/tracing/clickhouse/mapper/TraceSearchFilter.java`
- Modify: `platform/quasar-tracing-clickhouse/src/main/resources/mapper/TraceMapper.xml`
- Modify: `platform/quasar-tracing-server/src/test/java/org/quasar/tracing/server/controller/TraceControllerSearchTest.java`
- Modify: `platform/quasar-tracing-core/src/test/java/org/quasar/tracing/core/service/TraceServiceSearchTest.java`

**Interfaces:**
- Consumes: `TraceAttributeConditionParser.parse(String)` from Task 1.
- Produces: optional controller parameter `attributes`.
- Produces: `TraceSearchFilter.attributeConditions: List<TraceAttributeConditionDTO>`.
- Produces: `TraceService.search(..., List<TraceAttributeConditionDTO> attributeConditions, ...)` while keeping all existing filter semantics.

- [ ] **Step 1: Write controller and service propagation tests**

Controller test:

```java
mvc.perform(get("/api/traces")
        .param("attributes", "[{\"scope\":\"span\",\"key\":\"db.system\",\"operator\":\"equals\",\"value\":\"mysql\"}]"))
    .andExpect(status().isOk());

verify(service).search(
    any(), any(), any(), any(), any(), any(), any(), any(), any(),
    any(), any(), any(), any(), any(), any(),
    argThat(items -> items.size() == 1 && "db.system".equals(items.get(0).getKey())),
    any(), any(), any()
);
```

Also assert malformed JSON returns HTTP 400 and the service is not invoked.

Service test must capture `TraceSearchFilter` and assert its conditions are the same normalized list passed to the service.

- [ ] **Step 2: Run focused backend tests and verify red**

Run:

```powershell
mvn -s "$env:MAVEN_HOME\conf\settings.xml" -pl quasar-tracing-server -am "-Dtest=TraceControllerSearchTest,TraceServiceSearchTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

Expected: compilation/test failure because signatures and filter fields are unchanged.

- [ ] **Step 3: Wire controller, service, and filter**

Inject `TraceAttributeConditionParser` into `TraceController`, accept `@RequestParam(required = false) String attributes`, parse once at the boundary, and pass the typed list to `TraceService`.

Add the condition list to the end of `TraceSearchFilter` so existing positional semantics remain visually auditable. Normalize `null` to `List.of()` in `TraceService`.

- [ ] **Step 4: Add the fixed MyBatis predicate matrix**

Inside the shared `searchBody`, add this structure after fixed resource filters:

```xml
<if test="attributeConditions != null and !attributeConditions.isEmpty()">
    AND countIf(
    <foreach collection="attributeConditions" item="condition" separator=" AND ">
        <choose>
            <when test="condition.scope == 'resource'">
                <choose>
                    <when test="condition.operator == 'exists'">
                        mapContains(ResourceAttributes, #{condition.key})
                    </when>
                    <when test="condition.operator == 'equals'">
                        (mapContains(ResourceAttributes, #{condition.key})
                         AND ResourceAttributes[#{condition.key}] = #{condition.value})
                    </when>
                    <otherwise>
                        (mapContains(ResourceAttributes, #{condition.key})
                         AND positionCaseInsensitive(ResourceAttributes[#{condition.key}], #{condition.value}) > 0)
                    </otherwise>
                </choose>
            </when>
            <otherwise>
                <choose>
                    <when test="condition.operator == 'exists'">
                        mapContains(SpanAttributes, #{condition.key})
                    </when>
                    <when test="condition.operator == 'equals'">
                        (mapContains(SpanAttributes, #{condition.key})
                         AND SpanAttributes[#{condition.key}] = #{condition.value})
                    </when>
                    <otherwise>
                        (mapContains(SpanAttributes, #{condition.key})
                         AND positionCaseInsensitive(SpanAttributes[#{condition.key}], #{condition.value}) > 0)
                    </otherwise>
                </choose>
            </otherwise>
        </choose>
    </foreach>
    ) > 0
</if>
```

Write the complete SpanAttributes branches; do not use a dynamic column variable or `${}`.

- [ ] **Step 5: Run focused tests and full platform tests**

Run:

```powershell
mvn -s "$env:MAVEN_HOME\conf\settings.xml" -pl quasar-tracing-server -am "-Dtest=TraceAttributeConditionParserTest,TraceControllerSearchTest,TraceServiceSearchTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
mvn -s "$env:MAVEN_HOME\conf\settings.xml" test
```

Expected: all tests PASS.

- [ ] **Step 6: Verify ClickHouse semantics locally**

Start only the existing simple stack components needed by the API/ClickHouse path. Seed two traces: one where a single Span satisfies both conditions and one where two different Spans satisfy one condition each. Query `/api/traces` with the same two conditions.

Expected:

- same-Span trace returned;
- split-Span trace absent;
- `data.total` matches records;
- invalid scope/key payload returns 400;
- `EXPLAIN indexes = 1` shows time-range pruning and reports any usable Map indexes without requiring a schema change.

- [ ] **Step 7: Commit checkpoint — skip in current execution**

After separate authorization only:

```powershell
git add platform/quasar-tracing-server platform/quasar-tracing-core platform/quasar-tracing-clickhouse
git commit -m "feat: query traces by span attributes"
```

---

### Task 3: Trace Search URL Model and Pure Tests

**Files:**
- Create: `control-panel/src/utils/traceSearchParams.js`
- Create: `control-panel/src/utils/traceSearchParams.test.js`
- Modify: `control-panel/package.json`
- Modify: `control-panel/src/pages/TraceSearch/TraceSearchPage.jsx`

**Interfaces:**
- Produces: `normalizeAttributeConditions(conditions): { conditions, errors }`.
- Produces: `decodeTraceSearchParams(searchParams): { filters, attributeError }`.
- Produces: `encodeTraceSearchParams(filters): URLSearchParams`.
- Produces: `toTraceSearchRequest(filters): object`, with `attributes` as JSON or `undefined`.
- Existing `q`, resource filters, status, and duration behavior must remain identical.

- [ ] **Step 1: Write pure URL and validation tests**

Tests must include:

```js
test('round trips special attribute values', () => {
  const filters = {
    status: 'all',
    attributeConditions: [{
      scope: 'span',
      key: 'db.statement',
      operator: 'contains',
      value: 'name="张三" & status=ok',
    }],
  };
  const params = encodeTraceSearchParams(filters);
  const decoded = decodeTraceSearchParams(params);
  assert.deepEqual(decoded.filters.attributeConditions, filters.attributeConditions);
  assert.equal(decoded.attributeError, null);
});
```

Also test malformed JSON, unknown enum, duplicate conditions, six rows, `exists` Value removal, fixed filters, and `toTraceSearchRequest()` omitting an empty `attributes` parameter.

- [ ] **Step 2: Add the test script and verify red**

Add:

```json
"test:control-panel": "node --test src/utils/traceAnalysis.test.js src/utils/traceSearchParams.test.js"
```

Run:

```powershell
npm --prefix control-panel run test:control-panel
```

Expected: FAIL because `traceSearchParams.js` is missing.

- [ ] **Step 3: Implement the pure URL module**

Use constants matching the backend exactly. `decodeTraceSearchParams()` must catch JSON/validation errors and return a stable error object/string instead of throwing into React. `encodeTraceSearchParams()` must not emit `status=all`, empty strings, empty arrays, or undefined values.

Do not depend on React, Ant Design, i18n, or browser globals except the standard `URLSearchParams` constructor.

- [ ] **Step 4: Replace local TraceSearch serialization helpers**

Move `compactFilters`, URL parsing, and `filtersToSearchParams` behavior into the utility. The page owns only form/applied state and presentation.

When `attributeError` is present:

- do not call `searchTraces`;
- render a clearable error Alert;
- Reset removes the malformed URL parameter;
- fixed filters are not silently executed as a broader query.

Pass `attributes: JSON.stringify(applied.attributeConditions)` only through `toTraceSearchRequest()`.

- [ ] **Step 5: Run pure tests and build**

Run:

```powershell
npm --prefix control-panel run test:control-panel
npm --prefix control-panel run build
```

Expected: tests and Vite build PASS; only the existing chunk-size warning is allowed.

- [ ] **Step 6: Commit checkpoint — skip in current execution**

After separate authorization only:

```powershell
git add control-panel/package.json control-panel/src/utils control-panel/src/pages/TraceSearch/TraceSearchPage.jsx
git commit -m "feat: persist trace attribute filters"
```

---

### Task 4: Attribute Filter Builder and Trace Search Integration

**Files:**
- Create: `control-panel/src/components/TraceAttributeFilterBuilder.jsx`
- Modify: `control-panel/src/pages/TraceSearch/TraceSearchPage.jsx`
- Modify: `control-panel/src/i18n/locales/en.js`
- Modify: `control-panel/src/i18n/locales/zh-CN.js`
- Modify: `control-panel/src/styles/global.css`

**Interfaces:**
- Consumes: normalized `attributeConditions` and row errors from Task 3.
- Produces: `onChange(nextConditions)` only; the component never applies queries itself.
- UI maximum: five rows.

- [ ] **Step 1: Add exact bilingual copy**

Add keys for title, add/remove, Resource, Span, Key, Equals, Contains, Exists, Value, maximum-five message, invalid URL, duplicate, required, and applied-condition Chip text. English and Chinese must describe “same Span matches all conditions”.

- [ ] **Step 2: Implement the controlled builder**

Use stable client-only row IDs rather than array index as React keys. Each row contains scope Select, free-input AutoComplete/Input for Key, operator Select, conditional Value Input, and Remove button.

Static Key suggestions include the current diagnostic groups:

```js
const COMMON_KEYS = {
  resource: [
    'service.namespace', 'service.instance.id', 'service.version',
    'deployment.environment.name', 'k8s.namespace.name', 'k8s.pod.name',
    'k8s.node.name', 'container.id', 'telemetry.sdk.language',
  ],
  span: [
    'http.route', 'http.request.method', 'http.response.status_code',
    'db.system', 'db.operation.name', 'db.query.text',
    'rpc.system', 'rpc.service', 'rpc.method',
    'messaging.system', 'messaging.destination.name',
    'error.type', 'exception.type', 'exception.message',
  ],
};
```

Suggestions do not restrict custom keys.

- [ ] **Step 3: Integrate Apply, Reset, Chips, and responsive layout**

Insert the builder in the existing advanced Collapse below fixed metadata fields. Disable Apply when rows are incomplete/invalid. Applied Chips remove one condition and immediately update both applied state and URL using the same normalization function.

At `max-width: 768px`, stack row fields and keep Remove reachable without horizontal page overflow.

- [ ] **Step 4: Run tests and build**

Run:

```powershell
npm --prefix control-panel run test:control-panel
npm --prefix control-panel run build
git diff --check
```

Expected: all PASS.

- [ ] **Step 5: Commit checkpoint — skip in current execution**

After separate authorization only:

```powershell
git add control-panel/src/components/TraceAttributeFilterBuilder.jsx control-panel/src/pages/TraceSearch control-panel/src/i18n control-panel/src/styles/global.css
git commit -m "feat: add trace attribute filter builder"
```

---

### Task 5: Span Attribute Shortcut and P1-A Browser Acceptance

**Files:**
- Create: `control-panel/src/utils/investigationContext.js`
- Create: `control-panel/src/utils/investigationContext.test.js`
- Create: `control-panel/src/hooks/useInvestigationRange.js`
- Modify: `control-panel/package.json`
- Modify: `control-panel/src/components/AttributeTable.jsx`
- Modify: `control-panel/src/components/SpanDetailDrawer.jsx`
- Modify: `control-panel/src/pages/TraceDetail/TraceDetailPage.jsx`
- Modify: `control-panel/src/pages/TraceSearch/TraceSearchPage.jsx`
- Modify: `control-panel/src/i18n/locales/en.js`
- Modify: `control-panel/src/i18n/locales/zh-CN.js`

**Interfaces:**
- Produces: `traceInvestigationWindow(summary, now): { from, to } | null`.
- Produces: `buildTraceAttributeSearchPath(condition, window): string`.
- Produces: `useInvestigationRange(searchParams): effectiveRange`, which applies valid `from/to` once and returns the URL range immediately for the first request.
- Extensible by P1-B; do not embed target-specific UI in the pure module.
- Produces: optional `AttributeTable.onFilterAttribute(key, value)`.

- [ ] **Step 1: Write investigation primitive tests**

Cover a 2-second trace, future `to` clamping, missing summary, malformed `from/to`, and an Attribute path with special characters. Exact window assertion:

```js
assert.deepEqual(
  traceInvestigationWindow({ startTime: 1_000_000, durationNs: 2_000_000_000 }, 2_000_000),
  { from: 700_000, to: 1_302_000 },
);
```

Update `test:control-panel` to include `investigationContext.test.js` and verify red.

- [ ] **Step 2: Implement the pure window/path module and Hook**

The Hook validates finite integer `from < to`, compares with the current AppContext range, and calls `setCustomRange` only when different. It returns the valid URL range immediately, falling back to AppContext range when absent/invalid, and must not loop on every render.

Use its returned `effectiveRange` in Trace Search so the first query already uses the restored range; the synchronization Effect only keeps TopBar/AppContext consistent and must not cause a duplicate old-range request.

- [ ] **Step 3: Add optional AttributeTable actions**

Extend the component signature without changing default callers:

```jsx
export default function AttributeTable({
  data,
  emptyText = '—',
  onFilterAttribute,
})
```

When the callback exists, render a small accessible search button next to each non-empty value. Button click must stop propagation and call `onFilterAttribute(key, String(value))`.

- [ ] **Step 4: Wire Resource/Span scope in SpanDetailDrawer**

Add two explicit props:

```jsx
onFilterResourceAttribute
onFilterSpanAttribute
```

Pass them only to the matching AttributeTable. `TraceDetailPage` computes the Trace window from `data.summary`, builds the search path, and navigates. Do not enable this callback on Log Detail.

- [ ] **Step 5: Run unit/build gates**

Run:

```powershell
npm --prefix control-panel run test:control-panel
npm --prefix control-panel run build
mvn -s "$env:MAVEN_HOME\conf\settings.xml" test
git diff --check
```

Expected: all PASS.

- [ ] **Step 6: Run real-browser P1-A acceptance**

Use the existing webapp-testing helper and local Chrome. Intercept APIs with deterministic fixtures and assert:

- Attribute add/edit/remove/Reset/max-five behavior;
- `exists` hides Value;
- URL/request JSON equality;
- back/forward/reload recovery;
- malformed URL sends zero Trace search requests;
- Resource/Span shortcut scope and `from/to`;
- desktop and 390px mobile hit testing and no document overflow;
- zero page, console, request, unexpected API, and non-2xx errors.

Save acceptance artifacts under ignored `output/playwright/`.

- [ ] **Step 7: P1-A review gate**

Review the complete P1-A diff against `docs/superpowers/specs/2026-07-18-p1-advanced-query-investigation-design.md`. Do not start P1-B while any Critical/Important finding remains.

- [ ] **Step 8: Commit checkpoint — skip in current execution**

After separate authorization only:

```powershell
git add control-panel platform docs/superpowers/plans/2026-07-18-p1a-structured-attribute-query.md
git commit -m "feat: add structured trace attribute query"
```
