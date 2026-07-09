# Realtime Log Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an application-level realtime log view that feels like a console tail by incrementally reading persisted OpenTelemetry logs and appending them in the UI.

**Architecture:** Keep the existing ClickHouse-backed log search as the source of truth. Add a Spring MVC SSE endpoint that polls for newly persisted logs with a cursor and pushes records to the browser; the control panel opens an independent EventSource connection that does not use or mutate the global auto-refresh state.

**Tech Stack:** Java 17, Spring Boot MVC, MyBatis, ClickHouse SQL, React 18, Ant Design, Vite, nginx, Helm.

## Global Constraints

- Code attribution in comments and author tags must use `Quasar`.
- Do not add external tooling, generated-content, or co-author attribution to code or commit messages.
- Keep changes scoped to realtime application log streaming; do not redesign existing trace/log/metric search.
- Reuse existing log filters and `LogRecordDTO` shape unless a field is strictly needed for streaming.
- Realtime mode is independent from the global auto-refresh option and must not depend on `autoRefreshRevision`.
- Realtime mode starts from the moment it is enabled by default; it must not follow global time range updates after the stream starts.
- Existing `/api/logs` query behavior, pagination, histogram, and trace log correlation must remain compatible.
- Prefer SSE over WebSocket for the first implementation because the stream is server-to-browser only.
- Use ClickHouse incremental reads for the first implementation; do not add Kafka consumers in the platform service.
- Local commands must be Windows/PowerShell compatible. Use Maven from `$env:MAVEN_HOME` if a Maven build is needed.

---

## File Structure

- Modify `platform/quasar-tracing-clickhouse/src/main/java/org/quasar/tracing/clickhouse/mapper/LogSearchFilter.java`
  - Add cursor fields used only by stream queries.
- Modify `platform/quasar-tracing-clickhouse/src/main/java/org/quasar/tracing/clickhouse/mapper/LogMapper.java`
  - Add a method for forward incremental log reads.
- Modify `platform/quasar-tracing-clickhouse/src/main/resources/mapper/LogMapper.xml`
  - Add stream SQL that reuses `logWhere` and orders oldest-to-newest.
- Modify `platform/quasar-tracing-core/src/main/java/org/quasar/tracing/core/service/LogService.java`
  - Add `streamRecent(...)` style service method that returns new `LogRecordDTO` rows without count or histogram work.
- Modify `platform/quasar-tracing-server/src/main/java/org/quasar/tracing/server/controller/LogController.java`
  - Add `GET /api/logs/stream` with `SseEmitter`, heartbeat, disconnection cleanup, and independent stream cursor handling.
- Modify `platform/quasar-tracing-server/src/test/java/org/quasar/tracing/server/controller/LogControllerTest.java`
  - Add controller coverage for stream parameter forwarding and SSE response type.
- Modify `platform/quasar-tracing-core/src/test/java/org/quasar/tracing/core/service/LogServiceTest.java`
  - Add service coverage for stream limit clamping, cursor construction, record ordering, and DTO mapping.
- Modify `control-panel/src/api/index.js`
  - Add an EventSource URL builder for `/api/logs/stream`.
- Modify `control-panel/src/pages/LogSearch/LogSearchPage.jsx`
  - Add realtime mode UI, EventSource lifecycle, local log buffer, pause/resume, clear, and autoscroll.
- Modify `control-panel/src/i18n/locales/zh-CN.js` and `control-panel/src/i18n/locales/en.js`
  - Add labels for realtime mode.
- Modify `control-panel/src/styles/global.css`
  - Add console-style log stream presentation without disturbing existing table styles.
- Modify `control-panel/vite.config.js`
  - Ensure dev proxy supports SSE.
- Modify `control-panel/nginx.conf` and `deploy/helm/quasar-tracing/templates/configmaps.yaml`
  - Add stream-specific proxy buffering and timeout config.

---

### Task 1: Backend Incremental Log Stream

**Files:**
- Modify: `platform/quasar-tracing-clickhouse/src/main/java/org/quasar/tracing/clickhouse/mapper/LogSearchFilter.java`
- Modify: `platform/quasar-tracing-clickhouse/src/main/java/org/quasar/tracing/clickhouse/mapper/LogMapper.java`
- Modify: `platform/quasar-tracing-clickhouse/src/main/resources/mapper/LogMapper.xml`
- Modify: `platform/quasar-tracing-core/src/main/java/org/quasar/tracing/core/service/LogService.java`
- Modify: `platform/quasar-tracing-server/src/main/java/org/quasar/tracing/server/controller/LogController.java`
- Test: `platform/quasar-tracing-core/src/test/java/org/quasar/tracing/core/service/LogServiceTest.java`
- Test: `platform/quasar-tracing-server/src/test/java/org/quasar/tracing/server/controller/LogControllerTest.java`

**Interfaces:**
- Consumes: Existing `LogSearchFilter`, `LogMapper.search(...)`, `LogService.search(...)`, `LogRecordDTO`, `/api/logs` request parameters.
- Produces: `LogMapper.stream(LogSearchFilter filter)`, `LogService.stream(...)`, `GET /api/logs/stream`, SSE event name `log`, SSE event name `heartbeat`, JSON payloads shaped as `LogRecordDTO`.

- [ ] **Step 1: Add service test for stream cursor and mapping**

Add a test method to `LogServiceTest`:

```java
@Test
void streamsLogsAfterCursorOldestFirst() {
    LogEntity first = log();
    first.setTimestamp(30_001L);
    first.setBody("first");
    LogEntity second = log();
    second.setTimestamp(30_002L);
    second.setBody("second");
    when(logMapper.stream(any())).thenReturn(List.of(first, second));

    List<LogRecordDTO> records = service.stream("mysql", "t", "s", "production", "quasar", "quasar-ns",
        "mysql-0", "node-1", "pod-uid-1", List.of("ERROR"), "deadlock", 30_000L, 300);

    assertThat(records).extracting(LogRecordDTO::getBody).containsExactly("first", "second");
    assertThat(records).extracting(LogRecordDTO::getTimestamp).containsExactly(30_001L, 30_002L);
    ArgumentCaptor<LogSearchFilter> captor = ArgumentCaptor.forClass(LogSearchFilter.class);
    verify(logMapper).stream(captor.capture());
    LogSearchFilter filter = captor.getValue();
    assertThat(filter.getFrom()).isEqualTo(30_000L);
    assertThat(filter.getTo()).isGreaterThanOrEqualTo(30_000L);
    assertThat(filter.getLimit()).isEqualTo(300);
    assertThat(filter.getService()).isEqualTo("mysql");
    assertThat(filter.getTraceId()).isEqualTo("t");
    assertThat(filter.getSpanId()).isEqualTo("s");
    assertThat(filter.getSeverities()).containsExactly("ERROR");
    assertThat(filter.getQ()).isEqualTo("deadlock");
}
```

- [ ] **Step 2: Run the service test and confirm it fails**

Run:

```powershell
$mvn = Join-Path $env:MAVEN_HOME 'bin/mvn.cmd'
$settings = Join-Path $env:MAVEN_HOME 'conf/settings.xml'
$argsList = @('-s', $settings, '-pl', 'quasar-tracing-core', '-am', '-Dtest=LogServiceTest', 'test')
Push-Location platform
& $mvn @argsList
Pop-Location
```

Expected: compile/test failure because `LogService.stream(...)` and `LogMapper.stream(...)` do not exist.

- [ ] **Step 3: Extend mapper filter and mapper interface**

Add fields to `LogSearchFilter`:

```java
/** Cursor timestamp for forward stream reads, epoch milliseconds. */
private Long cursor;
```

Add method to `LogMapper`:

```java
/**
 * Reads matching logs newer than the stream cursor, oldest first.
 *
 * @param filter normalized search inputs
 * @return new logs after the cursor
 */
List<LogEntity> stream(LogSearchFilter filter);
```

- [ ] **Step 4: Add ClickHouse stream SQL**

Add to `LogMapper.xml`:

```xml
<select id="stream" resultMap="logResultMap">
    SELECT
        toUnixTimestamp64Milli(Timestamp) AS timestamp,
        TraceId      AS traceId,
        SpanId       AS spanId,
        SeverityText AS severity,
        ServiceName  AS service,
        Body         AS body,
        ResourceAttributes AS resourceAttributes
    FROM quasar_tracing.logs
    <where>
        <include refid="logWhere"/>
        <if test="cursor != null">
            AND Timestamp &gt; fromUnixTimestamp64Milli(#{cursor})
        </if>
    </where>
    ORDER BY Timestamp ASC
    LIMIT ${limit}
</select>
```

The service must set `from` and `cursor` consistently so `logWhere` keeps the window bounded while the cursor prevents duplicate reads.

- [ ] **Step 5: Implement `LogService.stream(...)`**

Add a method with this signature:

```java
public List<LogRecordDTO> stream(String service, String traceId, String spanId,
        String environment, String namespace, String k8sNamespace, String k8sPodName, String k8sNodeName,
        String serviceInstanceId, List<String> severities, String q, Long cursor, Integer limit)
```

Implementation requirements:
- If `cursor` is null, use `System.currentTimeMillis()` so a new stream starts from now.
- Use `query.clamp(limit, query.defaultLogLimit())` for the stream batch size.
- Set `from` and `cursor` to the resolved cursor.
- Set `to` to `System.currentTimeMillis()`.
- Call `logMapper.stream(filter)`.
- Map rows through the same DTO fields as `search(...)`.
- Create ids using `timestamp + "-" + i` for the stream batch.

- [ ] **Step 6: Add controller test for SSE stream endpoint**

Add a test method to `LogControllerTest`:

```java
@Test
void opensLogStream() throws Exception {
    when(logService.stream(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
        .thenReturn(List.of());

    mvc.perform(get("/api/logs/stream")
            .param("service", "mysql")
            .param("severities", "ERROR")
            .param("cursor", "30000"))
        .andExpect(status().isOk())
        .andExpect(header().string("Content-Type", org.hamcrest.Matchers.containsString("text/event-stream")));
}
```

- [ ] **Step 7: Implement `GET /api/logs/stream`**

Add to `LogController`:

```java
@GetMapping(path = "/logs/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public SseEmitter stream(
        @RequestParam(required = false) String service,
        @RequestParam(required = false) String traceId,
        @RequestParam(required = false) String spanId,
        @RequestParam(required = false) String environment,
        @RequestParam(required = false) String namespace,
        @RequestParam(required = false) String k8sNamespace,
        @RequestParam(required = false) String k8sPodName,
        @RequestParam(required = false) String k8sNodeName,
        @RequestParam(required = false) String serviceInstanceId,
        @RequestParam(required = false) String severities,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) Long cursor,
        @RequestParam(required = false) Integer limit)
```

Implementation requirements:
- Use `SseEmitter` with a timeout of `0L`.
- Use a single-thread executor per emitter or a named shared executor bean if one already exists.
- Every loop: call `logService.stream(...)`, send each row as `SseEmitter.event().name("log").data(record)`, advance cursor to the max row timestamp, then send heartbeat with the current cursor.
- Sleep for 1000 ms between loops.
- On `IOException`, timeout, or completion, complete the emitter and stop the loop.
- Do not make this method depend on global auto-refresh.

- [ ] **Step 8: Run backend tests**

Run:

```powershell
$mvn = Join-Path $env:MAVEN_HOME 'bin/mvn.cmd'
$settings = Join-Path $env:MAVEN_HOME 'conf/settings.xml'
$argsList = @('-s', $settings, '-pl', 'quasar-tracing-server', '-am', '-Dtest=LogServiceTest,LogControllerTest', 'test')
Push-Location platform
& $mvn @argsList
Pop-Location
```

Expected: `LogServiceTest` and `LogControllerTest` pass.

---

### Task 2: Frontend Realtime Console Mode

**Files:**
- Modify: `control-panel/src/api/index.js`
- Modify: `control-panel/src/pages/LogSearch/LogSearchPage.jsx`
- Modify: `control-panel/src/i18n/locales/zh-CN.js`
- Modify: `control-panel/src/i18n/locales/en.js`
- Modify: `control-panel/src/styles/global.css`

**Interfaces:**
- Consumes: `GET /api/logs/stream`, SSE event name `log`, SSE payload shaped as `LogRecordDTO`, existing log filters, existing `formatTime(...)`, existing global range context.
- Produces: Independent realtime UI state: `liveEnabled`, `livePaused`, `liveItems`, `liveCursor`, `liveAutoScroll`, and a URL builder `buildLogStreamUrl(params)`.

- [ ] **Step 1: Add EventSource URL builder**

In `control-panel/src/api/index.js`, export:

```js
export function buildLogStreamUrl({ severities, ...params } = {}) {
  const query = new URLSearchParams();
  Object.entries({ ...params, severities: severities?.length ? severities.join(',') : undefined }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  const qs = query.toString();
  return qs ? `/api/logs/stream?${qs}` : '/api/logs/stream';
}
```

- [ ] **Step 2: Add realtime i18n labels**

Add to `logs` in both locale files:

```js
realtime: '实时日志',
realtimeHint: '追加读取新日志，独立于全局自动刷新',
startRealtime: '开始实时',
pauseRealtime: '暂停',
resumeRealtime: '继续',
stopRealtime: '停止',
clearRealtime: '清屏',
autoScroll: '自动滚动',
liveConnected: '已连接',
liveConnecting: '连接中',
livePaused: '已暂停',
liveStopped: '已停止',
liveError: '连接异常',
```

Use equivalent English copy in `en.js`.

- [ ] **Step 3: Add realtime state to `LogSearchPage`**

Add imports:

```js
import { Button, Switch, Space } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, ClearOutlined, DisconnectOutlined } from '@ant-design/icons';
import { useRef } from 'react';
import { buildLogStreamUrl } from '@/api';
```

Add state:

```js
const [liveEnabled, setLiveEnabled] = useState(false);
const [livePaused, setLivePaused] = useState(false);
const [liveItems, setLiveItems] = useState([]);
const [liveStatus, setLiveStatus] = useState('stopped');
const [liveAutoScroll, setLiveAutoScroll] = useState(true);
const streamRef = useRef(null);
const consoleRef = useRef(null);
```

Do not add `autoRefreshRevision` to the EventSource effect dependencies.

- [ ] **Step 4: Implement independent EventSource lifecycle**

Add an effect in `LogSearchPage`:

```js
useEffect(() => {
  if (!liveEnabled || livePaused) return undefined;
  const source = new EventSource(buildLogStreamUrl({
    ...applied,
    traceId,
    spanId,
    limit: 300,
  }));
  streamRef.current = source;
  setLiveStatus('connecting');

  source.addEventListener('open', () => setLiveStatus('connected'));
  source.addEventListener('log', (event) => {
    const record = JSON.parse(event.data);
    setLiveItems((items) => [...items, record].slice(-1000));
  });
  source.addEventListener('heartbeat', () => setLiveStatus('connected'));
  source.addEventListener('error', () => {
    setLiveStatus('error');
    source.close();
  });

  return () => {
    source.close();
    if (streamRef.current === source) streamRef.current = null;
  };
}, [liveEnabled, livePaused, applied, traceId, spanId]);
```

Add a second effect:

```js
useEffect(() => {
  if (!liveAutoScroll || !consoleRef.current) return;
  consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
}, [liveItems, liveAutoScroll]);
```

- [ ] **Step 5: Add realtime control bar and console view**

Place it above the existing histogram card:

```jsx
<Card size="small" className="log-live-card" title={t('logs.realtime')} extra={<Text type="secondary">{t(`logs.${liveStatusLabel}`)}</Text>}>
  <div className="log-live-toolbar">
    <Space wrap>
      {!liveEnabled ? (
        <Button icon={<PlayCircleOutlined />} type="primary" onClick={() => { setLiveItems([]); setLivePaused(false); setLiveEnabled(true); }}>
          {t('logs.startRealtime')}
        </Button>
      ) : (
        <Button icon={<DisconnectOutlined />} onClick={() => { setLiveEnabled(false); setLivePaused(false); setLiveStatus('stopped'); }}>
          {t('logs.stopRealtime')}
        </Button>
      )}
      <Button
        icon={livePaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
        disabled={!liveEnabled}
        onClick={() => setLivePaused((value) => !value)}
      >
        {livePaused ? t('logs.resumeRealtime') : t('logs.pauseRealtime')}
      </Button>
      <Button icon={<ClearOutlined />} onClick={() => setLiveItems([])}>
        {t('logs.clearRealtime')}
      </Button>
      <Switch checked={liveAutoScroll} onChange={setLiveAutoScroll} />
      <Text type="secondary">{t('logs.autoScroll')}</Text>
    </Space>
    <Text type="secondary">{t('logs.realtimeHint')}</Text>
  </div>
  <div ref={consoleRef} className="log-live-console">
    {liveItems.map((item) => (
      <div key={`${item.timestamp}-${item.service}-${item.traceId}-${item.spanId}-${item.body}`} className={`log-live-row severity-${item.severity || 'UNKNOWN'}`}>
        <span className="log-live-time">{formatTime(item.timestamp)}</span>
        <span className="log-live-severity">{item.severity || '-'}</span>
        <span className="log-live-service">{item.service || '-'}</span>
        <span className="log-live-body">{item.body}</span>
      </div>
    ))}
  </div>
</Card>
```

Adjust `liveStatusLabel` with a small map:

```js
const liveStatusLabel = livePaused ? 'livePaused' : {
  connected: 'liveConnected',
  connecting: 'liveConnecting',
  error: 'liveError',
  stopped: 'liveStopped',
}[liveStatus] || 'liveStopped';
```

- [ ] **Step 6: Add console CSS**

Add to `global.css`:

```css
.log-live-card {
  margin-bottom: 16px;
}

.log-live-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.log-live-console {
  height: 320px;
  overflow: auto;
  background: #101418;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 12px;
  color: #d7dde5;
  font-family: Consolas, 'SFMono-Regular', Menlo, Monaco, monospace;
  font-size: 12px;
  line-height: 1.65;
}

.log-live-row {
  display: grid;
  grid-template-columns: 92px 64px 180px minmax(0, 1fr);
  gap: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}

.log-live-time,
.log-live-severity,
.log-live-service {
  color: #94a3b8;
}

.log-live-body {
  color: #e2e8f0;
}

.log-live-row.severity-ERROR .log-live-severity,
.log-live-row.severity-FATAL .log-live-severity {
  color: #f87171;
}

.log-live-row.severity-WARN .log-live-severity {
  color: #fbbf24;
}

@media (max-width: 720px) {
  .log-live-row {
    grid-template-columns: 84px 58px minmax(0, 1fr);
  }

  .log-live-service {
    display: none;
  }
}
```

- [ ] **Step 7: Run frontend build**

Run:

```powershell
Push-Location control-panel
rtk npm run build
Pop-Location
```

Expected: Vite build succeeds.

---

### Task 3: Proxy and Deployment Stream Support

**Files:**
- Modify: `control-panel/vite.config.js`
- Modify: `control-panel/nginx.conf`
- Modify: `deploy/helm/quasar-tracing/templates/configmaps.yaml`

**Interfaces:**
- Consumes: `GET /api/logs/stream` SSE endpoint.
- Produces: dev, Docker, and Helm nginx proxy paths that keep the stream open and do not buffer SSE frames.

- [ ] **Step 1: Update Vite proxy for SSE**

Modify `control-panel/vite.config.js`:

```js
'/api/logs/stream': {
  target: 'http://127.0.0.1:8080',
  changeOrigin: true,
  timeout: 0,
},
```

Keep the existing `/api` proxy for non-stream requests after this more specific entry.

- [ ] **Step 2: Update Docker nginx stream location**

Add a location before the generic `/api/` block in `control-panel/nginx.conf`:

```nginx
location /api/logs/stream {
    resolver 127.0.0.11 valid=10s;
    set $platform_upstream http://platform:8080;
    proxy_pass $platform_upstream$request_uri;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
    add_header X-Accel-Buffering no;
}
```

- [ ] **Step 3: Update Helm nginx stream location**

Add the same stream-specific location before `location /api/` in the `control-panel-nginx` ConfigMap inside `deploy/helm/quasar-tracing/templates/configmaps.yaml`, but use `proxy_pass http://control-panel-server:8080;` to match the current Helm nginx style.

- [ ] **Step 4: Verify config syntax by inspection and build**

Run:

```powershell
git diff -- control-panel/vite.config.js control-panel/nginx.conf deploy/helm/quasar-tracing/templates/configmaps.yaml
Push-Location control-panel
rtk npm run build
Pop-Location
```

Expected: diff contains only stream proxy changes; frontend build succeeds.

---

### Task 4: Integration Review and Smoke Verification

**Files:**
- Review all files changed by Tasks 1-3.

**Interfaces:**
- Consumes: backend stream endpoint, frontend EventSource client, nginx stream proxy.
- Produces: integrated branch with tests/build passing and no unrelated changes.

- [ ] **Step 1: Review changed file set**

Run:

```powershell
git status --short
git diff --stat
```

Expected: only backend log stream files, frontend log stream files, proxy config, and this plan are changed.

- [ ] **Step 2: Run targeted backend tests**

Run:

```powershell
$mvn = Join-Path $env:MAVEN_HOME 'bin/mvn.cmd'
$settings = Join-Path $env:MAVEN_HOME 'conf/settings.xml'
$argsList = @('-s', $settings, '-pl', 'quasar-tracing-server', '-am', '-Dtest=LogServiceTest,LogControllerTest', 'test')
Push-Location platform
& $mvn @argsList
Pop-Location
```

Expected: targeted backend tests pass.

- [ ] **Step 3: Run frontend build**

Run:

```powershell
Push-Location control-panel
rtk npm run build
Pop-Location
```

Expected: Vite build succeeds.

- [ ] **Step 4: Check formatting and attribution**

Run:

```powershell
git diff --check
if (Get-Command rg -ErrorAction SilentlyContinue) {
  rg -n "external tooling attribution pattern" .
}
```

Expected: `git diff --check` has no output; attribution search finds no new offending lines.

- [ ] **Step 5: Commit**

Run:

```powershell
git add docs/superpowers/plans/2026-07-09-realtime-log-stream.md platform control-panel deploy
git commit -m "feat: add realtime log stream"
```

Expected: commit succeeds with a clean attribution message.

---

## Self-Review

- Spec coverage: plan covers backend stream API, frontend console-like realtime mode, independent state from global auto-refresh, proxy buffering, targeted tests, and build verification.
- Placeholder scan: no `TBD`, `TODO`, or undefined future work remains.
- Type consistency: `LogMapper.stream(LogSearchFilter filter)`, `LogService.stream(...)`, `/api/logs/stream`, and `buildLogStreamUrl(...)` are named consistently across tasks.
