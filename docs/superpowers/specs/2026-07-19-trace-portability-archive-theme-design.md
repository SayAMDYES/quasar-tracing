# Trace 可移植性、归档与暗色主题设计

## 文档状态

- 基线：`master@98651e17426d650af87f599263b0053c46004638`
- 范围：Trace Compare、Trace JSON、文件导入/导出、Trace 搜索结果下载、Archive、暗色主题
- 当前阶段：设计冻结，等待外部审核
- 本文不授权生产代码修改、提交、推送或部署

## 目标

这一轮补齐 Trace 的比较、查看、交换、长期保留和双主题能力，同时保持 Quasar Tracing 现有 React 18、Spring Boot 3.5、MyBatis、ClickHouse 架构。

六项能力必须分别可测试、可验收、可回滚：

1. 两条 Trace 的结构与耗时差异比较。
2. 查看平台实际保存并归一化后的 Trace JSON。
3. 导出 Trace 文件，并在浏览器中导入受支持的文件。
4. 下载当前 Trace 搜索条件命中的有限结果集。
5. 将 Trace 快照复制到独立 ClickHouse Archive 存储，并支持查询和删除。
6. 为 Ant Design、CSS、ECharts 提供一致的亮色、暗色和系统主题。

## 非目标

- 不新增认证、权限、审计主体或多租户模型。
- 不接收或声称恢复原始 OTLP payload。当前系统没有保存原始 OTLP 请求体。
- 不实现 OTLP protobuf、OTLP JSON、Zipkin、JSONL、gzip 或 zip 文件导入。
- 不引入通用异步任务队列、对象存储或新的数据库。
- 不改变现有实时 Trace、Log、Metric 摄取链路。
- 不实现 Jaeger 的 Trace Graph、Flamegraph、Span Table、SPM 或采样配置。
- 不批量删除 Archive，不自动删除实时 `spans` 数据。

## 现有实现事实

### Trace 数据

- `GET /api/traces` 返回分页 `TraceSummaryDTO`。
- `GET /api/traces/{traceId}` 返回 `TraceDetailDTO(summary, spans, services)`。
- `SpanDTO` 暴露毫秒时间戳、纳秒耗时、Resource/Span Attribute 和 Span Event。
- ClickHouse `spans` 还保存 `TraceState`、Scope 和 Links，但当前 `SpanDTO` 没有暴露这些字段。
- `spans` 默认 TTL 为 3 天，`trace_summary` 默认 TTL 为 30 天。
- 当前没有 Compare、document、export、import 或 archive API。

### 前端

- Trace Search 固定请求一页结果，表格分页大小为 20。
- Trace Detail 已有时间线、诊断、统计、关联日志页签。
- API 客户端统一解开 `QTResponse`，并把指定 Long 字段恢复为 Number。
- 当前颜色来自静态 `tokens.js`、根 CSS 变量和静态 ECharts option builder。
- Ant Design 固定使用 `theme.defaultAlgorithm`。
- `EChart` 是全站唯一的 ECharts 生命周期入口。

### Jaeger v2.19 参考边界

本设计参考但不复制以下实现：

- `TraceDiff` 使用两条 Trace 和可分享 URL 进入比较页。
- Trace Header 提供调整后 JSON 和未调整 JSON；Quasar 只提供一种明确命名的归一化 JSON。
- `FileLoader` 在浏览器中导入 Jaeger Query JSON，导入结果不写回后端。
- `DownloadResults` 使用有界并发获取完整 Trace 后生成 JSON。
- Archive 将 Trace 复制到独立归档存储。
- ThemeProvider 同时处理 AntD 算法、持久化和系统暗色偏好。

## 总体方案比较

### 方案 A：前端优先的 Jaeger 式拼装

Compare、JSON、导入导出和结果下载全部基于现有 `TraceDetailDTO` 在浏览器完成；Archive 只增加一个复制表接口。

优点：

- 后端改动最少。
- JSON 查看和 Compare 可以很快出现。

缺点：

- `TraceDetailDTO` 不是稳定交换格式，缺少 TraceState、Scope 和 Links。
- 每个页面会各自定义序列化规则。
- Archive、导入文件和实时 Trace 容易出现三套数据模型。

### 方案 B：统一后端导出任务平台

后端创建导出任务、生成文件并写对象存储；Compare、单条导出、批量下载和 Archive 都围绕任务与制品运行。

优点：

- 可扩展到超大批量、审计和离线制品。
- 浏览器内存压力最低。

缺点：

- 需要任务状态、清理、对象存储和失败恢复，明显超出当前平台规模。
- 认证和制品访问控制会成为不可回避的新范围。

### 方案 C：稳定 Trace Document 契约优先的六个纵向阶段

先定义一个版本化、归一化的 Trace Document。JSON 查看、单条导出、导入、Compare、结果下载和 Archive 都转换到该模型；批量下载仍在浏览器以有界并发完成，Archive 使用独立 ClickHouse 表。

优点：

- 六项能力共享一个明确的数据契约。
- 不引入任务队列或对象存储。
- 每个阶段可独立验收和回滚。
- 能明确区分“平台归一化 JSON”和“不存在的原始 OTLP payload”。

缺点：

- 第一阶段必须先补充 DTO 和映射，不能只做 UI。
- 浏览器下载必须设置严格数量、Span 数和大小上限。

## 推荐方案与交付顺序

选择方案 C，并拆成六个独立阶段：

1. Trace Document v1、JSON 查看和单条导出。
2. 文件导入。
3. Trace Compare。
4. Trace 搜索结果下载。
5. Archive。
6. 暗色主题。

阶段 2、3、4、5 依赖阶段 1 的稳定契约。阶段 6 在技术上独立，但放在最后统一验证所有新增页面的双主题表现。每个阶段通过后才进入下一阶段；Archive 不与前端主题改造放在同一验收批次。

## 总体架构

```text
ClickHouse live spans / archived spans
             |
             v
TraceDocumentService -> TraceDocumentDTO v1 -> QTResponse
             |                  |
             |                  +-> JSON Viewer / single export
             |                  +-> Compare normalizer
             |                  +-> bounded result download
             |                  +-> archive checksum / verification
             |
Browser file -> import parser -> TraceDocumentDTO v1 -> in-memory repository

ThemeProvider
  -> AntD createAntdTheme()
  -> html[data-theme] CSS variables
  -> EChart runtime theme + option palette
```

## Trace Document v1

### 定位

Trace Document 是 Quasar 从 ClickHouse 已保存字段生成的稳定、归一化交换模型。它不是原始 OTLP JSON，也不能标记为 raw、unadjusted 或 lossless OTLP。

对外名称统一为：

- UI：`Normalized JSON` / `归一化 JSON`
- Schema：`quasar.trace.bundle`
- MIME：`application/vnd.quasar.trace+json;version=1`

### 顶层格式

单条和多条导出都使用同一个 Bundle 包装：

```json
{
  "schema": "quasar.trace.bundle",
  "version": 1,
  "generatedAt": "2026-07-19T12:00:00.000Z",
  "generator": {
    "name": "quasar-tracing",
    "version": "1.0.7"
  },
  "partial": false,
  "failures": [],
  "traces": []
}
```

`failures` 只用于用户明确接受的部分批量下载。单条导出和完整批量导出必须是空数组。

### Bundle 自洽性和统一硬上限

所有 Bundle producer 和 importer 共用以下常量：

- `MAX_BUNDLE_BYTES = 100 MiB`，按 canonical UTF-8 实际字节数计算。
- `MAX_TRACES_PER_BUNDLE = 100`。
- `MAX_SPANS_PER_TRACE = 20,000`。
- `MAX_SPANS_PER_BUNDLE = 50,000`。

producer 必须在创建下载前完成 canonical stringify，并以 UTF-8 Blob 的实际 `size` 做最终检查，不能只依赖对象大小估算。importer 在读取前检查文件字节数，在解析后检查 Trace/Span 数量。

平台保证：本平台生成的所有 `partial=false` v1 Bundle 都能被同版本 importer 接受。`partial=false` 时 `failures` 必须为空，否则文件无效。

`partial=true` Bundle 明确不可导入。importer 检测到它后拒绝整份文件，错误码为 `PARTIAL_BUNDLE_NOT_IMPORTABLE`；不得忽略 `failures` 后加载其中的 Trace。部分下载仍可用于离线审阅，但不是可往返交换制品。

### Trace 格式

每个 `traces[]` 元素固定包含：

```json
{
  "traceId": "32-hex-lowercase",
  "startTimeUnixNano": "1784414400000000000",
  "durationNano": "125000000",
  "root": {
    "spanId": "16-hex-lowercase",
    "serviceName": "checkout-service",
    "name": "POST /checkout",
    "selection": "natural"
  },
  "services": ["checkout-service"],
  "warnings": [],
  "spans": []
}
```

每个 `spans[]` 元素固定包含：

- `traceId`、`spanId`、`parentSpanId`、`traceState`
- `serviceName`、`name`、`kind`
- `startTimeUnixNano`、`durationNano`
- `status: { code, message }`
- `resourceAttributes`
- `scope: { name, version }`
- `spanAttributes`
- `events: [{ timeUnixNano, name, attributes }]`
- `links: [{ traceId, spanId, traceState, attributes }]`

`warnings[]` 元素固定为 `{ code, spanId, message }`。`spanId` 在 Trace 级 warning 中为空字符串，message 最大 512 个 Unicode code point。warning 按 `(code, spanId, message)` 排序并去重。

### 稳定性规则

- 所有 64 位整数使用十进制字符串，禁止在浏览器中转为 Number 后再导出。
- Trace ID 和 Span ID 输出小写；不合法 ID 在服务端数据映射阶段拒绝导出。
- Span 按 `startTimeUnixNano`、`spanId` 排序。
- `services` 去重后按 Unicode code point 排序。
- Attribute Map 的 Key 按 Unicode code point 排序，Value 保持存储字符串，不推断数字、布尔或 JSON。
- Event 和 Link 保持 ClickHouse 数组顺序。
- 缺失字符串输出空字符串，缺失 Attribute 输出空对象，缺失数组输出空数组。
- v1 不删除或重命名字段；新增字段只能是可选字段。破坏性调整必须升级 `version`。
- JSON 使用 UTF-8、两个空格缩进、LF 换行，文件末尾一个 LF。
- 后端 DTO 使用显式 `@JsonPropertyOrder`；前端导入后重新导出也必须经过 canonicalizer。

### Root、Trace Start 和 Duration

live、archive 和 Jaeger import 必须使用同一套规则：

1. 零 Span Trace 无法形成 Document，拒绝并返回 `TRACE_HAS_NO_SPANS`。
2. 每个 Span 的 start 和 duration 必须是非负整数；运算使用 BigInteger/BigInt，不经过浮点数。
3. `trace.startTimeUnixNano = min(span.startTimeUnixNano)`。
4. `traceEndUnixNano = max(span.startTimeUnixNano + span.durationNano)`。
5. `trace.durationNano = traceEndUnixNano - trace.startTimeUnixNano`。不得使用选中 root Span 的 duration 代替 Trace duration。
6. natural root 是 `parentSpanId` 为空的 Span。
7. orphan root 是 `parentSpanId` 非空但目标 Span 不存在的 Span；保留原 parentSpanId，并增加 `MISSING_PARENT` warning。
8. 对 parent graph 运行强连通分量检测。每个包含环的分量选择 `(startTimeUnixNano, spanId)` 最小的 Span 作为 cycle representative；仅在派生树、root 选择、深度、自耗时和 Compare 遍历中忽略该 representative 的 parent edge，Document 中原 parentSpanId 不变，并增加 `PARENT_CYCLE` warning。
9. primary root 按候选类别 `natural -> orphan -> cycle representative` 选择第一个非空集合，再按 `(startTimeUnixNano, spanId)` 取最小值。
10. `root.selection` 分别输出 `natural | orphan | cycle`。存在多个有效 root 时增加 `MULTIPLE_ROOTS` warning，但仍按上述规则选择唯一 `root` 字段。

所有树遍历必须消费同一个 canonical topology 结果，禁止 JSON、Compare 和现有 Trace Analysis 各自实现不同的 cycle/root 修复逻辑。后端 Java 与前端 JavaScript 使用同一组 golden fixtures 验证完全一致的 root/start/duration/warnings。

### API 和 DTO

新增：

- `GET /api/traces/{traceId}/document?source=auto|live|archive`
- `TraceDocumentDTO`
- `TraceDocumentSpanDTO`
- `TraceDocumentEventDTO`
- `TraceDocumentLinkDTO`
- `TraceDocumentBundleDTO`
- `TraceSource` 枚举

`source` 默认 `auto`：先查 live，未找到再查 archive。响应继续使用 `QTResponse<TraceDocumentDTO>`；下载文件的 Bundle 在前端 canonicalizer 中创建。

`TraceDocumentService` 是唯一从存储实体生成 v1 Document 的组件。现有 `TraceService.detail()` 继续返回 UI 友好的 `TraceDetailDTO`，避免破坏现有消费者。

`SpanEntity` 和 `SpanMapper` 补齐 TraceState、Scope 和 Links 映射。现有 detail API 可以暂不暴露这些字段，但 document API 必须覆盖 ClickHouse 已保存字段。Document DTO 额外包含 `TraceDocumentWarningDTO` 和 `root.selection`。

### JSON 页面

Trace Detail 增加 `JSON` 页签：

- 显示醒目的“Normalized JSON，不是原始 OTLP payload”说明。
- 使用固定行高视觉段虚拟化文本查看器，避免大 JSON 一次性创建全部 DOM 行。
- 提供复制、下载、折行切换和文本搜索。
- 下载名为 `quasar-trace-{traceId}.json`。
- JSON 生成或复制失败时保留页面并显示可重试错误，不回退展示普通 `TraceDetailDTO`。

单条 Document 上限：20,000 Span 或 canonical UTF-8 50 MiB；超过上限返回 HTTP 413 和稳定错误码 `TRACE_DOCUMENT_TOO_LARGE`。Bundle 包装后的最终文件仍受统一 100 MiB 上限约束。

折行不能直接使用 `white-space: pre-wrap`，因为它会产生不可预测行高。查看器规则固定为：

1. 未折行模式：每个逻辑 JSON 行对应一个固定高度 visual segment，允许水平滚动。
2. 折行模式：Web Worker 根据容器宽度、等宽字体实测字符宽度和最少 40 列，计算 `columnsPerSegment`；按 Unicode code point 将每个逻辑行拆成固定高度 visual segments。
3. 主线程只渲染可视 visual segments 和前后各 20 段 overscan，不渲染完整逻辑行 DOM。
4. 每段保存 `{logicalLine, startCodePoint, endCodePoint}`，搜索结果先定位逻辑 offset 再映射到 segment。
5. ResizeObserver 只触发 Worker 重新分段并替换 segment index，不切换到全量 DOM 测量。
6. Copy/download 始终使用原 canonical string，不拼接已分段文本。

当前页面只查看单条最多 50 MiB Document；100 MiB Bundle 不作为一个 `<pre>` 打开。若导入结果未来增加 Bundle 预览，也必须复用同一 segment virtualization，不能降级为全量 DOM。

## 文件导入与导出

### 支持格式

只支持 UTF-8 `.json`：

1. Quasar Trace Bundle v1。
2. Jaeger Query JSON：单个 Trace、Trace 数组、`{ "data": trace }` 或 `{ "data": [trace] }`，Trace 必须包含 `traceID`、`spans` 和 `processes`。

明确拒绝：

- OTLP JSON / `resourceSpans`
- OTLP protobuf
- Zipkin JSON
- JSONL
- gzip、zip
- 仅有 Trace Summary、没有完整 Span 的文件

### 导入边界

- 单文件最大 100 MiB。
- 单文件最多 100 条 Trace。
- 单条 Trace 最多 20,000 Span。
- 单文件最多 50,000 Span。
- 解析前检查文件大小；解析后检查结构和数量。
- 每条 Trace 要么完整接受，要么完整拒绝，不接受部分 Span。
- 文件内 Trace ID 必须唯一；重复 Trace ID 后一条拒绝，第一条保留。
- 未知顶层字段忽略并在导入报告中计数；未知 Span 字段不进入 v1 Document。
- Quasar v1 遇到未知 `version` 时拒绝整份文件，不能猜测兼容。
- Quasar v1 `partial=true` 时按 `PARTIAL_BUNDLE_NOT_IMPORTABLE` 拒绝整份文件。
- Quasar v1 `partial=false` 但 `failures` 非空时按 `INVALID_BUNDLE_FAILURES` 拒绝整份文件。
- Jaeger 转换失败按 Trace 隔离；至少一条有效 Trace 时允许用户加载有效部分，并显示成功/失败数量。
- 零条有效 Trace 时不修改当前页面状态。

### Jaeger Query JSON 转换契约

Jaeger 转换先校验完整 Trace，再一次性产生 v1 Document。任何标记为“拒绝 Trace”的错误都不能留下部分 Span。

#### ID

- 外层 `traceID` 和每个 Span 的 `traceID` 接受 16 或 32 个十六进制字符，大小写不限。
- 16 位 Trace ID 左侧补 16 个 `0` 后转小写；32 位直接转小写。其他长度或非十六进制拒绝 Trace。
- 每个 Span 的规范化 traceID 必须等于外层 traceID，否则以 `TRACE_ID_CONFLICT` 拒绝 Trace。
- `spanID`、reference `spanID` 接受 1–16 个十六进制字符，左侧补 `0` 到 16 位并转小写。
- Span ID 规范化后必须唯一；冲突以 `DUPLICATE_SPAN_ID` 拒绝 Trace。
- reference `traceID` 使用相同 16/32 位规则；无法规范化时以 `INVALID_REFERENCE_TRACE_ID` 拒绝 Trace。

#### Parent 和 Link

- 只支持 `CHILD_OF`、`FOLLOWS_FROM`；其他 `refType` 以 `UNSUPPORTED_REFERENCE_TYPE` 拒绝 Trace。
- Parent 候选只考虑与当前 Span 同 Trace 的 reference。
- 按输入数组顺序选择第一个 `CHILD_OF`；没有时选择第一个 `FOLLOWS_FROM`。
- 选中的 reference 写入 `parentSpanId`，即使目标 Span 缺失也保留，由统一 orphan 规则处理。
- 其余 reference 全部转为 Link，保留规范化 traceId/spanId；Link Attribute 增加 `jaeger.ref_type=CHILD_OF|FOLLOWS_FROM`。
- 存在多个 Parent 候选时接受 Trace，但增加 `MULTIPLE_PARENT_REFERENCES` warning。
- 跨 Trace reference 永远是 Link，不参与 parent/root 计算。

#### Process、Service 和 Scope

- `processID` 缺失或在 `processes` 中不存在时，`serviceName=unknown-service`、Resource Attribute 为空，并增加 `MISSING_PROCESS` warning。
- process 存在但 `serviceName` 缺失/空白时使用 `unknown-service` 并增加 `MISSING_SERVICE_NAME` warning。
- process tags 转为 Resource Attribute；最终强制 `service.name=serviceName`。
- process tags 中已有不同的 `service.name` 时以 `SERVICE_NAME_CONFLICT` 拒绝 Trace；相同值去重。
- `otel.library.name`、`otel.library.version` 从 Span tags 映射到 Scope；缺失时 Scope name/version 均为空字符串。

#### 时间和名称

- Jaeger `startTime`、`duration` 单位均为微秒，接受非负安全整数 Number 或只含十进制数字的 String。
- 转换公式为 `unixNano = microseconds * 1000`，使用 BigInt；负数、浮点、NaN、Infinity 或超出 64 位无符号范围以 `INVALID_SPAN_TIME` 拒绝 Trace。
- `operationName` 去除首尾空白后必须非空，否则以 `MISSING_OPERATION_NAME` 拒绝 Trace；映射到 Span `name`。
- Trace start、duration 和 root 不读取 Jaeger 顶层派生值，统一从转换后的 Span 集合重新计算。

#### Tag、Kind 和 Status

- process tags 和 Span tags 的 Key 去除首尾空白后必须非空。
- Jaeger tag/field 的可选 `type` 只接受 `string|bool|int64|float64|binary`。缺失 type 时从 JSON scalar 推断；未知 type 以 `UNSUPPORTED_TAG_TYPE` 拒绝 Trace。
- `string` 要求 String；`bool` 要求 Boolean并输出 `true|false`；`int64` 接受安全整数 Number 或十进制 String并用 BigInt 规范化；`float64` 要求有限 Number并用 JSON 最短十进制表示；`binary` 要求合法 Base64 String并原样保存 Base64 文本。type 与 value 不匹配时以 `TAG_TYPE_VALUE_CONFLICT` 拒绝 Trace。
- 未声明 type 的 Value 只接受 String、Boolean、有限 Number并按上述规则转换。Null tag 忽略并增加 `NULL_TAG_IGNORED` warning；Array/Object 以 `UNSUPPORTED_TAG_VALUE` 拒绝 Trace。
- 同一 Attribute Map 内重复 Key 且规范化值相同则去重并增加 `DUPLICATE_TAG` warning；值不同以 `DUPLICATE_TAG_CONFLICT` 拒绝 Trace。
- `span.kind` 大小写不敏感地接受 `internal|server|client|producer|consumer`；缺失为 `Internal`；未知值保留原 Attribute、kind 使用 `Internal` 并增加 `UNKNOWN_SPAN_KIND` warning。
- `otel.status_code` 大小写不敏感地接受 `UNSET|OK|ERROR`。没有该 tag 时，`error=true`、字符串 `true|1` 或非零 Number 映射 ERROR；其他情况映射 OK。
- `error` 指示 ERROR 时优先于显式 OK/UNSET，并增加 `STATUS_CONFLICT` warning。
- ERROR message 依次取 `otel.status_description`、`error.message`、`message` 的第一个非空字符串，否则为 `error`；非 ERROR message 为空字符串。
- 控制字段仍保留在 Span Attribute 中，确保导入后可审阅原值。

#### Logs、Warnings 和未知字段

- 每个 Jaeger log 转为一个 Event；log timestamp 按微秒乘 1000，非法 timestamp 以 `INVALID_LOG_TIME` 拒绝 Trace。
- Event name 取第一个 Key 为 `event` 且 Value 可转换为非空字符串的 field，否则为 `log`。
- 所有 log fields 按 Tag 规则转为 Event Attribute，包括 `event` field 本身。
- Span `warnings[]` 转为 Trace Document warning，code 为 `JAEGER_WARNING`、spanId 为当前 Span；非字符串 warning 转为字符串失败时以 `INVALID_WARNING` 拒绝 Trace。
- Jaeger Trace 顶层 `warnings[]` 如存在，使用空 spanId 转为 `JAEGER_WARNING`。
- 未识别的顶层、Span、process、reference 或 log 字段忽略，并按对象路径增加 `UNKNOWN_FIELD_IGNORED` warning；不把未知字段塞入 Attribute。

### 导入生命周期

- 导入解析全部在浏览器执行，不上传服务器。
- 有效 Trace 转换为 v1 Document 后写入内存 `ImportedTraceRepository`。
- 导入内容不写 localStorage、sessionStorage 或 IndexedDB，刷新即清除，降低敏感 Trace 落盘风险。
- 导入 Trace 带 `Imported` 标识，可以查看 JSON、再次导出，并可在当前会话中参与 Compare。
- 引用导入 Trace 的 Compare URL 标记为不可分享；刷新后显示“导入数据已失效”，不静默改查同 ID 的线上 Trace。

## Trace Compare

### 入口和路由

- Trace Search 表格增加 Compare 选择列，最多选择两条。
- 选择两条后启用 Compare 命令。
- Trace Detail 提供“设为基线”和“与另一条比较”入口。
- 路由为 `/traces/compare?a=<source-ref>&b=<source-ref>`。
- live source-ref 为 `live:{traceId}`；导入 source-ref 为 `import:{sessionId}`。
- 两条 live Trace 的 URL 可分享；任一 import Trace 存在时页面明确显示“仅当前会话有效”。

### 页面交互

Compare 页顶部固定显示：

- A：Baseline
- B：Candidate
- 交换 A/B
- 分别打开原 Trace
- 总耗时、Span 数、错误数、服务数、关键路径耗时的 A/B/Delta

主体使用一棵合并后的差异树，而不是两个独立瀑布图：

```text
Operation / Service | A duration | B duration | Delta | Status | Change flags
```

支持过滤：`All`、`Regressions`、`Status changed`、`Added`、`Removed`、`Attribute/Event changed`。点击行打开左右并排 Span 详情，展示两个 Span 的属性差异。

### Span 对齐模型

不使用 Span ID 对齐，因为不同请求的 Span ID 天然不同。使用确定性的结构路径：

1. 为所有 root Span 创建虚拟根。
2. Span 基础签名为 `(serviceName, name, kind)`。
3. 同一父节点下相同签名的兄弟按 `(start offset, spanId)` 排序并分配 occurrence index。
4. Match Key 为 `parentMatchKey / signature # occurrence`。
5. A、B Match Key 相同即为 matched；只有 A 为 removed；只有 B 为 added。

不做模糊字符串匹配，不根据 Attribute 猜测对齐，避免无法解释的比较结果。

### 差异模型

matched Span 计算：

- `durationNano` A/B、绝对差和百分比差。
- `selfDurationNano` A/B、绝对差和百分比差。
- Status code/message 是否变化。
- Resource Attribute 和 Span Attribute 的 added/removed/changed Key。
- Event 以 `(name, canonical attributes)` 多重集合比较；忽略绝对事件时间。
- 关键路径成员关系是否变化。

耗时回归标记同时满足：

- Candidate 比 Baseline 慢至少 1 ms；并且
- Candidate 增幅至少 10%。

所有精确 Delta 仍展示；阈值只控制 `regression` 标记。Baseline 为 0 时百分比为 `null`，不显示无穷大。

Trace ID、Span ID、Parent Span ID 和绝对开始时间不参与 `changed` 判断。Attribute Value 按字符串精确比较，区分大小写。

### 计算边界

- Compare 在前端对两个 v1 Document 运行纯函数，不新增 compare 后端 API。
- 每条最多 20,000 Span；两条合计超过 30,000 Span 时拒绝 Compare，但仍允许分别查看和导出。
- Compare 工具函数必须确定性排序，输入顺序变化不能改变结果。

## Trace 搜索结果下载

### 下载集合

- 下载基于点击时已经 Apply 的搜索条件、排序和时间窗。
- 下载最多前 100 条唯一 Trace，按当前排序稳定截取。
- 搜索总数超过 100 时，UI 必须显示“下载前 100 条”，不能暗示全量导出。
- 先用 `GET /api/traces?limit=100&offset=0` 获取快照 ID，再逐条获取 document。
- 导入 Trace 不混入服务端搜索下载；导入文件使用单独的再次导出入口。

### 并发、大小和取消

- Document 请求并发固定为 4。
- 每个请求超时 15 秒。
- 网络错误、HTTP 429、502、503、504 最多重试一次，退避 500 ms 加 0–250 ms jitter。
- 其他 4xx 不重试。
- 用户可以取消；取消后中止所有 `AbortController`，不生成文件。
- 总 Span 上限 50,000。
- Bundle canonical stringify 后的 UTF-8 实际上限为 100 MiB；达到任一上限即停止且不生成文件。

### 失败策略

- 全部成功：直接生成 `partial=false` Bundle。
- 零条成功：不生成文件，显示失败汇总。
- 部分成功：完成所有可继续请求后显示失败清单，只有用户确认“下载部分结果”才生成文件。
- 部分文件设置 `partial=true`，并记录 `{ traceId, code, message }`；message 使用稳定、无堆栈的错误文本。
- 404 视为实时 TTL 期间 Trace 已消失，允许部分下载但必须列入失败。
- 失败不得静默省略。

文件名：`quasar-traces-{yyyyMMdd-HHmmss}.json`。

## Archive

### 语义

- Archive 是从实时 `spans` 到独立表的不可变快照复制，不是移动。
- 归档成功不会删除或延长 live 数据；live 数据仍按现有 3 天 TTL 清理。
- 相同 Trace ID 已有 ACTIVE 归档时再次 Archive 返回已有结果，不重新复制晚到 Span。
- 若要刷新快照，第一版必须先逻辑删除旧 Archive，再重新 Archive；tombstone 写入成功后即可重新归档，不等待物理 mutation。不提供隐式覆盖。

### 配置

新增：

```yaml
quasar:
  tracing:
    archive:
      enabled: false
      retention-days: 180
      max-spans-per-trace: 20000
```

- 默认关闭，确保旧部署未执行 DDL 时 API 不暴露半可用能力。
- `retention-days` 允许 30–3650，写入时计算并固化 `ExpiresAt`；修改配置只影响新归档。
- 启用前必须同时完成 simple 与 Helm SQL 迁移。

### ClickHouse 表

#### `trace_archive_manifest`

```sql
CREATE TABLE IF NOT EXISTS quasar_tracing.trace_archive_manifest
(
    TraceId         String,
    Generation      UUID,
    Revision        UInt64,
    RevisionId      UUID,
    State           Enum8('ACTIVE' = 1, 'DELETED' = 2),
    ArchivedAt      DateTime64(3),
    ExpiresAt       DateTime64(3),
    SourceStartTime DateTime64(9),
    SourceEndTime   DateTime64(9),
    RootServiceName LowCardinality(String),
    RootSpanName    LowCardinality(String),
    DurationNano    UInt64,
    SpanCount       UInt32,
    ErrorCount      UInt32,
    Status          LowCardinality(String),
    Services        Array(String),
    ChecksumSha256  FixedString(64),
    UpdatedAt       DateTime64(9),
    INDEX idx_archive_service RootServiceName TYPE set(1000) GRANULARITY 4,
    INDEX idx_archive_start SourceStartTime TYPE minmax GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ArchivedAt)
ORDER BY TraceId
TTL ExpiresAt DELETE;
```

#### `trace_archive_spans`

```sql
CREATE TABLE IF NOT EXISTS quasar_tracing.trace_archive_spans
(
    ArchiveGeneration    UUID,
    ArchivedAt           DateTime64(3),
    ExpiresAt            DateTime64(3),
    Timestamp            DateTime64(9) CODEC(Delta(8), ZSTD(1)),
    TraceId              String CODEC(ZSTD(1)),
    SpanId               String CODEC(ZSTD(1)),
    ParentSpanId         String CODEC(ZSTD(1)),
    TraceState           String CODEC(ZSTD(1)),
    SpanName             LowCardinality(String) CODEC(ZSTD(1)),
    SpanKind             LowCardinality(String) CODEC(ZSTD(1)),
    ServiceName          LowCardinality(String) CODEC(ZSTD(1)),
    ResourceAttributes   Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    ScopeName            String CODEC(ZSTD(1)),
    ScopeVersion         String CODEC(ZSTD(1)),
    SpanAttributes       Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    Duration             UInt64 CODEC(ZSTD(1)),
    StatusCode           LowCardinality(String) CODEC(ZSTD(1)),
    StatusMessage        String CODEC(ZSTD(1)),
    `Events.Timestamp`   Array(DateTime64(9)) CODEC(ZSTD(1)),
    `Events.Name`        Array(LowCardinality(String)) CODEC(ZSTD(1)),
    `Events.Attributes`  Array(Map(LowCardinality(String), String)) CODEC(ZSTD(1)),
    `Links.TraceId`      Array(String) CODEC(ZSTD(1)),
    `Links.SpanId`       Array(String) CODEC(ZSTD(1)),
    `Links.TraceState`   Array(String) CODEC(ZSTD(1)),
    `Links.Attributes`   Array(Map(LowCardinality(String), String)) CODEC(ZSTD(1)),
    INDEX idx_archive_trace_id TraceId TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_archive_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_archive_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_archive_span_attr_key mapKeys(SpanAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_archive_span_attr_value mapValues(SpanAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_archive_duration Duration TYPE minmax GRANULARITY 1,
    INDEX idx_archive_source_time Timestamp TYPE minmax GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ArchivedAt)
ORDER BY (TraceId, ArchiveGeneration, SpanId)
TTL ExpiresAt DELETE;
```

simple 与 Helm DDL 必须逐字段一致，并通过测试比较规范化后的 CREATE TABLE 定义。未来 live `spans` 增加持久化列时，不自动改变 v1 Archive；必须显式评估、迁移两份 Archive DDL 和 Document 契约。

两张 Archive 表都使用 append-only 普通 `MergeTree`，引擎不承担状态替换或 Span 去重：

- manifest 的每次 ACTIVE/DELETED 转移都是独立事实行，所有行保留到各自 `ExpiresAt` 触发 TTL；后台 merge 和 `OPTIMIZE` 不得折叠状态历史。最新状态唯一由下述共享跨分区 `argMax` 规则选择。
- archived spans 以 `(TraceId, ArchiveGeneration, SpanId)` 唯一为写入前提，但 ClickHouse 引擎不执行或模拟该唯一约束。重复 Span、冲突 Span 或部分重写必须原样保留，并使 Generation 回读的 SpanCount 或 canonical checksum 校验失败，不能由 merge 隐藏。
- 同一 Generation 的回读行集、SpanCount 和 canonical checksum 在后台 merge 或 `OPTIMIZE TABLE ... FINAL` 前后必须相同；否则不得写 ACTIVE manifest。

### 无事务写入协议

ClickHouse 跨表没有事务，归档使用 Manifest 控制可见性：

1. 校验功能已启用、Trace ID 合法，并通过统一 latest-state 查询确认没有 ACTIVE manifest。
2. 从 live `spans` 读取并生成 canonical v1 Trace object；检查统一 Span/字节上限，记录 `sourceSpanCount` 和 `sourceChecksumSha256`。
3. 生成 `Generation UUID`、`ArchivedAt` 和 `ExpiresAt`。
4. `INSERT SELECT` 全量写入 `trace_archive_spans`，携带 Generation。
5. 只从该 Generation 回读全部 Archive Span，重新构建 canonical v1 Document，计算 `archiveSpanCount` 和 `archiveChecksumSha256`。
6. 必须同时满足 `archiveSpanCount == sourceSpanCount` 和 `archiveChecksumSha256 == sourceChecksumSha256`。任一不等均返回 HTTP 409 `ARCHIVE_VERIFICATION_FAILED`，不得写 ACTIVE manifest，并对该 Generation 发起 best-effort 清理。
7. 校验通过后，跨所有 manifest 分区查询该 Trace 的 `max(Revision)`，写入 `Revision=max+1`、新 `RevisionId UUID` 的 ACTIVE manifest；manifest checksum 使用已经验证的 `archiveChecksumSha256`。
8. 请求返回前再次执行 latest-state 查询。只有本次 Generation 是最新 ACTIVE 时返回 201；若另一并发请求成为最新状态，则返回该最新状态，输掉竞争的 Generation 不可见并进入清理。
9. 写入中断产生的 orphan generation 对用户不可见，由 `ExpiresAt` TTL 清理；服务端同时发起 best-effort mutation 删除。

SpanCount 不能替代内容验证。字段丢失、字段值损坏、数组错位、写入期间新 Span 被 `INSERT SELECT` 纳入、或源/目标查询观察到不同集合，都会导致 canonical SHA-256 不同并阻止 ACTIVE。

checksum 输入固定为单个 canonical `traces[]` 元素的 UTF-8 JSON，不包含 Bundle 的 `generatedAt`、generator、partial、failures，也不包含 live/archive source 元数据。Java 和 JavaScript 使用同一 golden byte fixture 验证 checksum。

### 跨分区最新状态规则

`trace_archive_manifest` 是跨月份的 append-only 状态日志。普通 `MergeTree` 不选择最新状态，所有状态读取也禁止使用 `FINAL` 判断最新状态。Mapper 必须定义一个共享 `latestArchiveManifest` SQL fragment，对全部月份执行：

```sql
SELECT
    TraceId,
    argMax(
        tuple(
            Generation, State, ArchivedAt, ExpiresAt,
            SourceStartTime, SourceEndTime,
            RootServiceName, RootSpanName, DurationNano,
            SpanCount, ErrorCount, Status, Services, ChecksumSha256,
            Revision, UpdatedAt, RevisionId
        ),
        tuple(Revision, UpdatedAt, RevisionId)
    ) AS latest
FROM quasar_tracing.trace_archive_manifest
GROUP BY TraceId
```

`Revision` 是每个 Trace 的逻辑序号，先比较；`UpdatedAt` 由 ClickHouse `now64(9)` 生成；`RevisionId` 为并发同 Revision 的确定性最终 tie-break。引擎不得在该比较发生前删除任何候选行；因此同 Revision 并发写入时，即使 `UpdatedAt` 相同，也只由 `RevisionId` 决定稳定结果。Detail、Search、document、archive-status、POST 幂等检查和 DELETE 必须全部消费这一 fragment，不能各写一套 latest 规则。对未过期行，后台 merge 或 `OPTIMIZE TABLE trace_archive_manifest FINAL` 前后，物理行数和该 fragment 的结果必须保持不变。

latest fragment 先选状态，再由消费者判断 `ExpiresAt > now64(3)`；过期 ACTIVE 即使尚未被 TTL merge 物理删除，也按 ABSENT 处理。计算下一 Revision 时仍扫描尚存的所有历史行；`max(Revision)=UInt64 max` 时拒绝写入并返回 `ARCHIVE_REVISION_EXHAUSTED`。

跨月流程必须正确：旧月份 ACTIVE -> 新月份 DELETED -> 更晚月份重新 ACTIVE 时，最新 ACTIVE 以更高 Revision 胜出；旧 partition 中的状态不能重新出现。

幂等语义：

- 已存在 ACTIVE：HTTP 200，返回原 manifest。
- 首次成功：HTTP 201。
- live 和 archive 都不存在：HTTP 404。
- 同一 Trace 并发请求只有一个 Generation 可成为最新 ACTIVE；输掉竞争的 Generation 不可见并进入清理。
- 最新状态为 DELETED 时允许立即重新 Archive，并写入更高 Revision 的 ACTIVE。

### 查询语义

现有 API 增加 `source=live|archive|auto`：

- Search 默认 `live`，不把 live 与 archive 隐式 union，避免重复 Trace。
- Detail/document 默认 `auto`，live 优先，未找到再查最新 ACTIVE archive。
- `source=archive` 的 `from/to` 仍表示原始 Trace 开始时间，不表示 ArchivedAt。
- Archive Search 支持现有 Trace 筛选和同 Span Attribute 语义；SQL 必须通过共享 `latestArchiveManifest` fragment 锁定最新 ACTIVE Generation，再读取对应 archived spans。
- 响应增加 `source` 和 `archivedAt` 元数据，前端显示 Archive 标识。

### API

- `POST /api/traces/{traceId}/archive`
- `GET /api/traces/{traceId}/archive-status`
- `DELETE /api/traces/{traceId}/archive`
- `GET /api/archive/capabilities`
- 现有 Search/Detail/document 增加 `source`

Archive 使用独立 `TraceArchiveController`、`TraceArchiveService`、`TraceArchiveMapper`，不把写入和 mutation 混入现有只读 `TraceService`。

`GET /api/archive/capabilities` 返回 `{ enabled, retentionDays, maxSpansPerTrace }`。Archive 关闭时，写入和删除 API 返回 HTTP 404，现有 live Search/Detail 不受影响；前端据此隐藏 Archive 写操作和 archive source 选项。

### 删除语义

1. DELETE 通过共享 latest-state 查询读取当前状态；没有 ACTIVE 时直接返回 HTTP 204。
2. 有 ACTIVE 时写入同 Trace/Generation、`Revision=max+1` 的 DELETED tombstone。tombstone 的 `ArchivedAt` 使用删除发生时间，因此允许落入新月份 partition；`ExpiresAt` 沿用被删除 Archive。
3. 写入后再次读取 latest-state；只有最新状态为 DELETED 才返回 HTTP 204。
4. tombstone 成为最新状态即视为删除完成。Detail/Search/document/status 立即视为不存在。
5. 服务端可以在响应前后 best-effort 发起只针对旧 Generation 的 ClickHouse mutation；mutation id、进度和 `system.mutations` 不进入 API 契约。
6. mutation 失败只记录受限错误日志，逻辑删除不回滚；Span 最终由原 `ExpiresAt` TTL 清理。
7. UI 收到 204 后立即显示删除完成，不轮询。
8. 删除 Archive 不影响 live `spans`，也不能按 TraceId 删除之后新建的 Generation。
9. tombstone 的 `ExpiresAt` 沿用原 Archive，确保旧 ACTIVE 行不会在 tombstone 先过期后重新可见。

第一版不提供批量删除。UI 必须二次确认并明确“不会删除实时 Trace”。

`GET /api/traces/{traceId}/archive-status` 在功能启用时始终返回 HTTP 200：最新 ACTIVE 返回 `{ archived: true, state: "ACTIVE", ...manifest }`；DELETED 或没有记录返回 `{ archived: false, state: "ABSENT" }`。不存在 `DELETING` 状态。

## 暗色主题

### 模式与持久化

主题偏好值固定为：`system | light | dark`。

- localStorage Key：`quasar.theme.mode`
- 无有效存储值时默认 `system`
- `system` 使用 `matchMedia('(prefers-color-scheme: dark)')`
- 只有在 `system` 模式监听系统变化；显式 light/dark 不跟随系统变化
- localStorage 不可用时退化为内存偏好，不影响页面启动
- `index.html` 在 React 加载前读取偏好并设置 `html[data-theme]`，避免首屏闪烁
- `html.style.colorScheme` 与有效主题同步

App Header 使用主题图标菜单选择 System、Light、Dark；不增加文本说明卡片。

### ThemeProvider 边界

新增 `ThemeProvider` 和 `useThemeMode()`，输出：

- `preference`
- `effectiveMode`
- `setPreference(mode)`
- `tokens`
- `chartTheme`

`main.jsx` 的层级为：

```text
ThemeProvider
  -> ConfigProvider(createAntdTheme(effectiveMode, tokens))
    -> AntApp
      -> Router / AppProvider
```

### Ant Design

- light 使用 `theme.defaultAlgorithm`。
- dark 使用 `theme.darkAlgorithm`。
- 现有组件 overrides 改成由 light/dark tokens 生成，不能在暗色下继续引用浅色硬编码值。
- Modal、Drawer、Dropdown、Tooltip、Notification、Table、Menu、Tabs、Segmented、Input 和 DatePicker 必须单独验收 portal 背景和对比度。

### CSS Variables

- `:root, html[data-theme='light']` 保留当前变量值。
- `html[data-theme='dark']` 定义完整对应变量，不在组件内散落暗色特例。
- 品牌橙保留，但为暗背景单独定义 hover、active、tint 和 glow。
- Surface 至少区分 canvas、surface、surface-muted，不能把暗色 UI 做成同一深蓝色。
- 所有新增 Compare、JSON、Import、Archive UI 从第一天只使用变量。

### ECharts

- `EChart` 从 ThemeProvider 获取 `effectiveMode` 和 runtime chart theme。
- 主题变化时 dispose 并重新 `echarts.init`，因为 ECharts theme 只在初始化时生效。
- `charts/options.js` 的静态轴线、文字、tooltip、legend、splitLine、loading mask 和 graph label 颜色改为由 `chartTheme` 生成。
- 页面在主题变化时重新构建 option；不得只改变 canvas 外层背景。
- Service Graph、Trace 分布、Metrics、Overview 和 Log Histogram 全部纳入双主题截图验收。

### 可访问性

- 普通文本和背景达到 WCAG AA 4.5:1。
- 大文本和非文本关键控件达到 3:1。
- 错误、告警、成功不能只依赖颜色。
- `prefers-reduced-motion` 现有行为保持不变。

## API、组件和模块边界

### 后端

- `TraceService`：保留现有 live Search/Detail/Logs 行为，并在 Stage 5 增加只读 source 路由；Archive 写入和删除不进入该服务。
- `TraceDocumentService`：live/archive 实体到 v1 Document 的唯一映射。
- `TraceArchiveService`：Archive 状态机、写入、校验、删除。
- `TraceArchiveMapper`：所有 archive manifest/span SQL。
- `TraceDocumentController`：document 只读 API。
- `TraceArchiveController`：archive 写/状态/删除 API。
- DTO 位于 `quasar-tracing-common`；ClickHouse entity/mapper 位于 `quasar-tracing-clickhouse`。

### 前端

- `traceDocument.js`：canonicalize、validate、stable stringify。
- `traceImport.js`：Quasar v1 与 Jaeger JSON 转换，不负责 UI。
- `traceCompare.js`：对齐和差异纯函数。
- `downloadPool.js`：并发、重试、取消和进度纯逻辑。
- `traceWorker.js` / `traceWorkerClient.js`：在 Web Worker 中调用 canonicalize、import 和 compare 纯函数；消息只使用结构化可克隆数据。
- `ImportedTraceRepository`：会话内内存数据。
- `ThemeProvider`：唯一主题状态源。
- 页面组件只编排上述模块，不复制解析、比较或序列化规则。

## 迁移与兼容

- 所有现有 Trace API 参数和响应字段保持兼容；新增参数均可选。
- `TraceDetailDTO` 不替换为 Document DTO。
- Archive DDL 只新增表，不修改 live `spans`。
- `archive.enabled=false` 时现有功能不依赖新表。
- Helm 与 simple SQL 必须同步，先建表再启用配置。
- 前端旧版本遇到新增响应字段会忽略；后端新版本仍支持旧前端。
- Bundle v1 importer 只接受 version 1；未来 v2 通过独立迁移器处理。

## 性能

- Document/Archive/Compare 单条硬上限 20,000 Span。
- Compare 两条合计上限 30,000 Span。
- 所有非 partial Bundle producer 和 importer 统一为 100 MiB、100 Trace、单 Trace 20,000 Span、总计 50,000 Span。
- 搜索下载 100 Trace、50,000 Span、100 MiB、并发 4。
- canonicalization、import 和 compare 使用 Web Worker；主线程只接收进度和最终模型。
- Archive Search 必须在代表性 180 天数据上运行 `EXPLAIN indexes = 1`。
- Archive Detail 以 TraceId + Generation 查询，必须命中 TraceId Bloom Filter。
- JSON Viewer 使用固定高度 visual segment，不渲染完整逻辑行 DOM；50/100 MiB synthetic input 下 DOM segment 数必须保持在 viewport + 40 overscan 内。

## 安全

- 文件导入不上传、不持久化到浏览器存储。
- JSON Viewer 对内容做纯文本渲染，禁止 `dangerouslySetInnerHTML`。
- 导出 filename 只使用规范化 Trace ID 和固定时间格式。
- 错误文件不回显完整内容；错误只包含路径、规则和计数。
- Attribute/Event Value 不执行 JSON、HTML 或 URL 解释。
- Archive SQL 的字符串、ID、时间和 Attribute 值只使用绑定参数；表名通过固定 Mapper 分支选择，禁止用户输入表名。`LIMIT/OFFSET` 沿用现有 Mapper 约束，仅允许插入经 `QueryProperties` clamp 的非负整数。
- 当前信任边界不变；本设计不新增权限，但 Archive 删除默认随 Archive 功能整体关闭。

## 测试策略

### Java

- DTO 序列化顺序和 Long 字符串测试。
- Document 映射覆盖 Scope、Event、Link、空字段、排序、非法 ID、多 root、缺父、cycle、完整 Trace start/duration envelope 和 warnings。
- Controller source 参数和 404/413 测试。
- Archive 幂等、并发竞争、部分写、Generation 回读 checksum、字段损坏、晚到 Span、跨月 delete/re-archive、manifest 可见性、TTL 和删除 tombstone 测试。
- Mapper SQL 测试覆盖 live/archive 固定分支和共享跨分区 `argMax` latest fragment；禁止 `${table}` 和未校验字符串插值，只允许既有 clamp 后的 `${limit}` / `${offset}`。
- ClickHouse 集成测试写入同 Trace、同 Revision、同 UpdatedAt、不同 RevisionId 且未过期的并发 manifest 行，断言 `OPTIMIZE ... FINAL` 或后台 merge 前后物理行数及 latest 结果不变，并由最大 RevisionId 稳定胜出。
- Archive Span 集成测试注入重复/冲突行，断言普通 `MergeTree` 不去重且激活校验失败；合法 Generation 在 `OPTIMIZE ... FINAL` 前后行数和 canonical checksum 不变。
- simple/Helm DDL 一致性测试，并明确拒绝两张 Archive 表使用 `ReplacingMergeTree`。

### Node/React

- Quasar v1 canonicalizer golden tests，以及最大单条和最大非 partial 批量 Bundle round-trip。
- partial Bundle 拒绝和 failures 自洽性测试。
- Jaeger JSON 导入 fixture 覆盖 ID、reference/parent/link、process/service、微秒时间、tags、kind、status、logs/events、warnings、未知/冲突字段和所有拒绝边界。
- Compare 重复兄弟、缺失父节点、added/removed、回归阈值和输入乱序测试。
- Download pool 并发不超过 4、重试一次、取消、部分失败确认测试。
- ThemeStorage、system media change、AntD algorithm 和 chart theme tests。

### 浏览器

- live Trace JSON 查看、复制和单条下载后重新导入。
- 最大 100 Trace/50,000 Span/100 MiB 非 partial Bundle 下载后重新导入并保持 canonical `traces[]`。
- partial Bundle 导入明确拒绝，不加载其中 Trace。
- Jaeger 文件部分成功导入和当前会话 Compare。
- 两条真实 Trace 的 Compare、交换、过滤、URL 刷新。
- 100 条结果下载的进度、取消和部分失败。
- Archive、live TTL 模拟、archive 查询、删除后立即不可见、无轮询，以及跨月删除后重新归档。
- 390、768、1440 px 下所有新增页面的 light/dark 截图。
- console 0 error，关键交互无重叠和横向溢出。

## 回滚

- 阶段 1–4：移除前端入口和新增只读 document API，不影响现有 Trace Detail/Search。
- 阶段 5：先将 `archive.enabled=false`，停止新写入；保留表用于回读或离线清理。不得在应用回滚中自动 DROP Archive 表。
- 阶段 6：将 ThemeProvider 默认锁为 light，并保留旧 light token 值；不删除用户 localStorage 数据，未来重新启用仍可恢复偏好。
- Bundle v1 一经对外导出即不得回收；即使 UI 回滚，后续版本仍须能导入 v1。

## 阶段验收门

### 阶段 1

- Document v1 golden fixture 稳定。
- 页面明确不称其为 raw OTLP。
- 单条导出满足统一 Bundle schema/硬上限，并通过 canonical v1 validator；完整 importer round-trip 在阶段 2 验收。
- root/start/duration/warnings 在 Java 和 JavaScript golden fixtures 中一致。

### 阶段 2

- 两种支持格式和全部限制有自动化测试。
- 部分失败按 Trace 隔离，导入数据只驻留内存。
- 所有平台生成的非 partial v1 Bundle 可导入；最大单条和最大批量的 export -> import -> re-export 均保持 canonical `traces[]`；partial v1 按固定错误码整份拒绝。

### 阶段 3

- 对齐和 Delta 纯函数确定性通过。
- 两条 live Trace URL 可分享；import URL 明确不可分享。

### 阶段 4

- 最大 100 条、并发 4、重试和部分失败行为可观测。
- 任何上限超出都不生成截断但伪装完整的文件。

### 阶段 5

- Archive 跨分区 latest、写后 count+checksum 激活、幂等、可见性、跨月 delete/re-archive、180 天保留、source 查询和立即完成的逻辑删除语义全部通过。
- live 表和现有摄取链路无变更。

### 阶段 6

- AntD、CSS、ECharts 同步切换。
- 系统偏好、持久化、无闪烁和双主题 Playwright 截图通过。

## 审核结论

本设计将六项功能拆成六个可独立验收阶段。关键基础是 Trace Document v1；它表示平台已保存字段的稳定归一化结果，不表示原始 OTLP payload。Archive 是独立 ClickHouse 快照，Compare 和下载保持在受限浏览器计算范围内，暗色主题由一个运行时 ThemeProvider 统一驱动。
