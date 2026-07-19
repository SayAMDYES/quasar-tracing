# P1 高级查询与诊断闭环设计

## 目标

P1 在已经完成的 Trace 详情工作台基础上补齐两项平台级能力：

1. P1-A：在 Trace Search 中按任意 Resource/Span Attribute 进行安全、结构化查询。
2. P1-B：让 Trace、Span、Log、Metric、Service Map 在同一调查时间窗和实体上下文中连续跳转。

P1 不复制 Jaeger 的整套查询语言或独立 SPM 页面。设计继续复用 Quasar 已有的 Trace、日志、指标、K8s 维度、服务拓扑和全局时间范围，使现有页面从“可以互相打开”提升为“能够保留上下文连续排障”。

## 交付拆分与顺序

P1 是一个产品阶段，但拆成两个独立、顺序交付的纵向切片：

- P1-A 先完成 Attribute Query 的前端、API、校验、ClickHouse 查询和验收。
- P1-B 在 P1-A 验收完成后实施跨信号调查上下文和同 Span 查询。

每个切片必须能够单独测试、审查和回滚。P1-B 不与 P1-A 混在同一个实现任务或验收门禁中。

选择该方式而不采用一次性大版本，原因是 P1 同时跨越 React 页面、Spring API、核心服务和 ClickHouse 查询。顺序交付可以隔离查询正确性与页面导航正确性，避免浏览器验收通过但底层查询语义仍有误判。

## 当前能力与约束

当前实现已经具备：

- `GET /api/traces` 的服务、根 Operation、Trace 状态、资源维度、耗时和时间范围过滤。
- `ResourceAttributes`、`SpanAttributes` 的 ClickHouse Map 存储。
- Map Key/Value Bloom Filter 和 TraceId、Duration 索引。
- Trace Detail 到关联日志，以及 Metrics 到 Trace/Log 的基本跳转。
- Service Map 到 Metrics、Log Detail 到 Trace 的跳转。
- `AppContext` 管理的全局快捷/自定义时间范围。

当前限制是：

- Trace Search 没有通用 Attribute 条件。
- Trace 查询中的 `operation` 表示根 Operation，不能准确承接 Metrics Endpoint 或子 Span 的 Operation。
- 跨页面跳转没有统一保存 `from/to`，目标页可能在错误时间窗内查询。
- 服务、实例、Operation、TraceId、SpanId 的参数映射散落在页面内。
- Span Attribute 只能查看，不能直接转化为 Trace 查询条件。

## 总体架构

### P1-A：结构化 Attribute Query

数据流如下：

```text
TraceAttributeFilterBuilder
  -> traceSearchParams URL 编码
  -> GET /api/traces?attributes=<encoded-json>
  -> TraceAttributeConditionParser
  -> TraceService / TraceSearchFilter
  -> TraceMapper.xml 同 Span 条件
  -> Trace 列表与总数
```

前端只生成结构化条件，不生成自由文本表达式或 SQL。后端在进入核心查询前完成完整校验，ClickHouse Mapper 只根据固定 scope/operator 分支选择预定义 SQL，并对 Key/Value 使用 MyBatis 参数绑定。

### P1-B：共享调查上下文

数据流如下：

```text
Trace / Span / Log / Metric / Service
  -> InvestigationContext
  -> buildInvestigationPath(destination, context)
  -> URL from/to + entity filters
  -> useInvestigationRange
  -> AppContext custom range
  -> target page query
```

纯函数负责时间窗计算和目标页面参数映射，页面只声明目标类型。任何页面不得自行复制一套 Trace/Log/Metric/Service Map 参数拼接逻辑。

## P1-A 数据契约

### HTTP 参数

继续使用现有 `GET /api/traces`，新增可选查询参数 `attributes`。参数值是 URL 编码后的 JSON 数组：

```json
[
  {
    "scope": "resource",
    "key": "deployment.environment.name",
    "operator": "equals",
    "value": "production"
  },
  {
    "scope": "span",
    "key": "db.system",
    "operator": "exists"
  }
]
```

`attributes` 缺失、空字符串或规范化后为 `[]` 时，不增加任何 Attribute 过滤，现有 API 行为保持不变。

### 条件字段

`scope` 只允许：

- `resource`：查询 `ResourceAttributes`。
- `span`：查询 `SpanAttributes`。

`operator` 只允许：

- `equals`：精确字符串匹配，区分大小写。
- `contains`：字符串包含匹配，不区分大小写。
- `exists`：只检查 Key 是否存在，不接受 Value。

ClickHouse 当前 Attribute Map 的 Value 类型是 `String`。P1 不进行数字、布尔值或数组类型推断；用户输入和存储值都按字符串比较。

### 校验与规范化

前后端使用同一组规则，后端是最终可信边界：

- 条件数量为 0–5。
- 原始 `attributes` 参数最大 4096 字符。
- Key 去除首尾空白后必须非空，最大 128 字符。
- `equals`、`contains` 必须有 Value，Value 最大 512 字符。
- `exists` 的 Value 必须缺失或为空；规范化结果不保存 Value。
- scope/operator 使用小写规范值，未知值直接拒绝。
- 条件按照用户顺序序列化，查询含义不依赖顺序。
- 完全相同的条件不允许重复。

JSON 无法解析或违反任一规则时，抛出 `InvalidQueryException`。`GlobalExceptionHandler` 将其转换为 HTTP 400 和现有 `QTResponse` 错误结构。

### ClickHouse 查询语义

所有 Attribute 条件采用 AND，并且必须由同一个 Span 同时满足：

```sql
HAVING countIf(
    condition_1
    AND condition_2
    AND condition_3
) > 0
```

这一定义排除下面的误匹配：Span A 满足第一个条件、Span B 满足第二个条件，但 Trace 仍被返回。

固定 SQL 片段为：

```sql
-- exists
mapContains(AttributeMap, #{condition.key})

-- equals
mapContains(AttributeMap, #{condition.key})
AND AttributeMap[#{condition.key}] = #{condition.value}

-- contains
mapContains(AttributeMap, #{condition.key})
AND positionCaseInsensitive(
    AttributeMap[#{condition.key}],
    #{condition.value}
) > 0
```

`AttributeMap` 不是用户输入：Mapper 根据 `scope` 在 `ResourceAttributes` 和 `SpanAttributes` 两个固定列之间选择。Key、Value 不得通过 `${}` 拼接。

`search` 和 `countSearch` 继续复用同一个 `searchBody`，保证列表数量与分页总数使用完全相同的过滤条件。

### 存储策略

第一版不增加表、物化视图、投影或新的索引。现有 `spans` 表已经包含 Resource/Span Map Key/Value Bloom Filter；实现验收时必须通过 `EXPLAIN indexes = 1` 确认实际查询能使用时间范围和可用索引。

只有在代表性 24 小时数据上无法达到性能门禁时，才另立存储优化方案。不得在 P1-A 中未经测量直接增加高基数 Attribute 展开表。

## P1-A 页面设计

### Attribute 条件构造器

Trace Search 的现有高级筛选区增加一个 Attribute 条件区，不新增页面。每一行结构为：

```text
[Resource/Span] [Attribute Key] [Equals/Contains/Exists] [Value] [Remove]
```

交互规则：

- 初始没有条件，点击“添加 Attribute 条件”增加一行。
- Key 输入提供静态常用 OTel Key 建议，同时允许自由输入。
- P1 不增加动态 Attribute Key 扫描接口。
- 选择 `exists` 时隐藏 Value。
- 条件不完整、重复或超长时显示行内错误并禁用 Apply。
- 达到 5 行时禁用新增按钮。
- Apply 后写入 URL，并在筛选区显示可关闭的已应用 Chip。
- Reset 清理固定筛选、Attribute 条件及其 URL 参数。
- 浏览器前进、后退和刷新必须恢复 form/applied 两套状态。
- 390px 视口下条件行纵向排列，不产生页面级横向滚动。

静态 Key 建议来自当前 Span 诊断分组覆盖的 HTTP、DB、RPC、Messaging、OTel、K8s 和 Runtime 常见键。建议列表仅改善输入效率，不限制自由输入。

### 从 Span Attribute 发起查询

`AttributeTable` 增加可选的 `onFilterAttribute(key, value)` 回调：

- Span Detail 的 Resource Attribute 传入 `scope=resource`。
- Span Detail 的 Span Attribute 传入 `scope=span`。
- 点击动作生成单个 `equals` 条件并打开 Trace Search。
- 查询携带当前 Trace 的调查时间窗。
- Log Detail 等未传入回调的调用方保持现有展示，不出现搜索动作。

## P1-B Trace 查询扩展

`GET /api/traces` 新增三个可选参数：

- `spanService`
- `spanOperation`
- `spanStatus=error|ok`

三个参数使用同一个 Span 选择器：

```sql
HAVING countIf(
    (spanService is absent OR ServiceName = spanService)
    AND (spanOperation is absent OR SpanName = spanOperation)
    AND (
      spanStatus is absent
      OR spanStatus = 'error' AND StatusCode = 'Error'
      OR spanStatus = 'ok' AND StatusCode != 'Error'
    )
) > 0
```

只有至少提供 `spanService`、`spanOperation` 或 `spanStatus` 之一时才添加该 `countIf` 条件。

现有参数语义保持不变：

- `service`：Trace 中包含该服务。
- `operation`：根 Operation。
- `status`：整条 Trace 是否包含 Error Span。

P1 不复用或改变 `operation` 的既有含义，避免现有书签、Metrics 之外的调用方和用户认知发生破坏性变化。

## P1-B 调查上下文

### 规范化结构

前端共享的调查上下文为：

```js
{
  from,
  to,
  service,
  serviceInstanceId,
  operation,
  environment,
  namespace,
  traceId,
  spanId,
}
```

所有值都允许缺失。URL 生成器只写入目标页面能够消费的非空值。

### Trace 调查窗口

从 Trace/Span 发起动作时：

```text
traceStart = summary.startTime
traceEnd   = summary.startTime + summary.durationNs / 1_000_000
from       = traceStart - 5 minutes
to         = traceEnd + 5 minutes
```

`to` 经过现有 `AppContext` 逻辑限制为不晚于当前时间。无有效 summary 时不伪造 `from/to`，目标页面继续使用当前全局范围。

### 目标页面映射

Trace Search：

- `service` -> `spanService`
- `operation` -> `spanOperation`
- Error Span -> `spanStatus=error`
- Attribute 快捷查询额外写入 `attributes`

Log Search：

- 使用 `traceId`、`spanId`、`service`
- 精确 Span 日志优先使用 `traceId + spanId`

Metrics：

- 使用 `service`、`serviceInstanceId`、`environment`、`namespace`

Service Map：

- `service` -> `focus`

所有目标页面同时保留有效 `from/to`。

### 时间窗恢复

Trace Search、Log Search、Metrics、Service Map 在挂载时使用共享 Hook 读取 `from/to`：

- 必须是有限整数。
- 必须满足 `from < to`。
- 有效时调用现有 `setCustomRange(from, to)`。
- 无效时忽略 URL 时间参数，不修改当前全局范围。
- Hook 比较当前范围，避免重复设置造成渲染循环。
- Hook 同时返回规范化后的 `effectiveRange`；目标页首个请求直接使用该值，不能先按旧 AppContext 范围发送一次请求再等待 Effect 修正。

TopBar 继续作为唯一时间范围展示和修改入口。P1 不增加第二套调查时间条。URL 范围同步完成后，用户在 TopBar 修改时间范围将覆盖当前调查范围，页面后续请求使用用户新选择；自动刷新保持当前自定义窗口，不把它变回快捷范围。

## P1-B 页面动作

### Span Detail Drawer

Drawer 顶部显示四个动作，桌面横向排列、窄屏自动换行：

- Span 日志：`traceId + spanId` 跳转 Log Search。
- 服务指标：服务、实例、环境、命名空间跳转 Metrics。
- 拓扑定位：服务跳转 Service Map。
- 相似 Trace：`spanService + spanOperation` 跳转 Trace Search；当前 Span 为 Error 时增加 `spanStatus=error`，非 Error 时不强加状态。

缺少动作必需字段时只禁用该动作，并提供可理解的 tooltip；不得生成空字符串查询参数。

### Metrics

Endpoint 表格中的 Trace 动作改用 `spanService/spanOperation`，不再把 Endpoint Operation 写入根 `operation`。Log 动作继续携带服务和 Operation 文本查询，同时使用共享调查 URL 生成器保存时间范围和资源维度。

### Service Map

服务详情面板在现有 Metrics 动作旁增加 Trace、Log：

- Trace：按 `spanService` 查询包含该服务 Span 的 Trace。
- Log：按 `service` 查询服务日志。
- Metrics：保留现有能力，但改用共享 URL 生成器。

### Log Detail

保留现有回 Trace 动作，新增：

- 服务指标：使用日志服务、实例、环境和命名空间。
- 拓扑定位：使用日志服务。

日志没有服务或 TraceId 时禁用相应动作。AttributeTable 在 Log Detail 中不启用 Trace Attribute 快捷查询，因为日志 Resource Attribute 与 Span Resource Attribute 的采集完整度不保证一致。

### Related Logs

继续保留 Trace/Span 范围切换和“在日志搜索中打开”。只把现有 URL 构造替换为共享调查上下文工具，不改变表格、分页或关联语义。

## 组件与文件职责

### P1-A

- `platform/quasar-tracing-common/.../TraceAttributeConditionDTO.java`：HTTP/核心/Mapper 共用的数据载体。
- `platform/quasar-tracing-server/.../TraceAttributeConditionParser.java`：JSON 解析、规范化和校验。
- `platform/quasar-tracing-core/.../InvalidQueryException.java`：可映射为 400 的查询错误。
- `TraceController.java`：接收 `attributes` 并传递类型化条件。
- `TraceService.java`：将条件放入标准化查询对象，不解释 SQL。
- `TraceSearchFilter.java`：携带已校验条件。
- `TraceMapper.xml`：固定 scope/operator 分支和参数绑定。
- `control-panel/src/components/TraceAttributeFilterBuilder.jsx`：条件编辑 UI。
- `control-panel/src/utils/traceSearchParams.js`：固定筛选与 Attribute 的 URL 编解码和前端校验。
- `AttributeTable.jsx`：可选 Attribute 搜索回调。

### P1-B

- `control-panel/src/utils/investigationContext.js`：窗口计算、目标适配和 URL 生成纯函数。
- `control-panel/src/hooks/useInvestigationRange.js`：URL 时间窗到 AppContext 的同步。
- `control-panel/src/components/SpanInvestigationActions.jsx`：Span 动作展示。
- Trace/Log/Metrics/Service Map 页面：只消费共享工具和声明目标，不复制参数规则。
- `TraceController.java`、`TraceService.java`、`TraceSearchFilter.java`、`TraceMapper.xml`：增加同 Span 选择器。

该设计不要求重写现有页面结构，也不把全部搜索条件迁移到新的全局状态库。

## 错误与空态

### 前端

- URL 中 `attributes` 无法解析时不发起 Trace 查询，显示可清除的格式错误。
- 条件编辑错误在行内展示，Apply 不可用。
- 后端 400 使用现有错误边界展示具体查询错误。
- 后端 500 不展示 SQL、表名或堆栈。
- 没有结果使用现有 Trace 空态。
- 调查参数不完整时禁用单个动作，不影响 Drawer 其他内容。

### 后端

- Attribute JSON、枚举、数量和长度问题统一抛出 `InvalidQueryException`。
- `GlobalExceptionHandler` 明确映射该异常为 HTTP 400。
- MyBatis 只接收已校验条件，但仍使用参数绑定作为第二层保护。
- ClickHouse 运行异常继续由统一 500 处理并记录服务端错误。

## 测试策略

### 后端单元与 Web Slice

必须覆盖：

- 合法 Attribute JSON 解析与规范化。
- 空参数和 `[]` 保持现有行为。
- 非法 JSON、未知 scope/operator、空 Key、超长 Key/Value、超过 5 条、重复条件。
- `equals/contains` 缺 Value。
- `exists` 带非空 Value。
- 无效条件通过 API 返回 HTTP 400 和 `QTResponse`。
- `spanService/spanOperation/spanStatus` 正确进入 `TraceSearchFilter`。
- 无新参数时现有 status、window、limit 默认值不变。

### ClickHouse 语义验证

使用本地 `deploy/simple/docker-compose.yml` 的 ClickHouse 和最小种子数据验证：

- 同一 Span 满足全部 Attribute 条件时命中。
- 不同 Span 分别满足条件时不命中。
- 缺失 Key 不等同于空值。
- `equals` 大小写敏感。
- `contains` 大小写不敏感。
- Resource/Span scope 读取正确 Map。
- spanService/spanOperation/spanStatus 必须由同一个 Span 满足。
- `search` 与 `countSearch` 返回一致总数。
- Key/Value 中的引号、百分号、下划线、反斜杠和中文不改变 SQL 结构。

### 前端纯函数测试

新增 Node 内置测试覆盖：

- Attribute 条件规范化、校验和 URL 正反序列化。
- 中文、引号、`&`、`=`、逗号等特殊字符不丢失。
- malformed URL 返回明确错误而不是抛到 React。
- 调查窗口计算。
- 无效 `from/to` 被拒绝。
- Trace、Log、Metrics、Service Map 四类路径映射。
- Error/非 Error Span 的相似 Trace 状态规则。

### 浏览器验收

使用真实 Chrome 和 API 拦截覆盖：

- Attribute 行新增、编辑、删除、Reset、5 条上限。
- `exists` 隐藏 Value。
- Apply 后请求参数和 URL 一致。
- 浏览器前进、后退、刷新恢复状态。
- 非法 URL 不发起 Trace Search API。
- Span Resource/Span Attribute 快捷查询 scope 正确。
- Span 四个动作的路径和参数正确。
- Metrics Endpoint 使用 spanOperation 而非根 operation。
- Service Map、Log Detail、Related Logs 使用共享调查链接。
- 目标页面刷新后时间窗和过滤条件仍在。
- 390px 视口无页面横向溢出且全部控件可命中。
- 页面错误、控制台错误、请求失败和非预期 API 请求均为 0。

## 性能门禁

在代表性 24 小时数据上比较基础 Trace 查询和 Attribute 查询：

- Attribute 查询绝对耗时目标不超过 3 秒。
- Attribute 查询耗时目标不超过相同时间窗基础 Trace 查询的 2 倍。
- 查询仍是单次 grouped scan，不允许先取全部 TraceId 再逐 Trace 查询。
- 使用 `EXPLAIN indexes = 1` 保存索引裁剪证据。
- 前端条件编解码和调查路径生成不得引入额外 API 请求。

本地数据量不足以证明性能时，实施结果必须明确标记“功能/语义已验收，代表性性能待发布授权后在目标环境验证”，不得把小数据集结果冒充生产性能。

## 兼容性与回滚

- `attributes`、`spanService`、`spanOperation`、`spanStatus` 都是可选参数。
- 未使用新参数的调用方保持当前 SQL 和返回结构。
- API 响应 DTO 不新增必填字段。
- 前端 URL 解析失败不会降级为宽泛查询。
- P1-A 可以独立回滚前端构造器、参数解析和 Mapper 条件。
- P1-B 可以独立回滚调查链接和同 Span 选择器，不影响 P1-A Attribute 查询。
- 不新增数据库对象，因此回滚不涉及表或物化视图清理。

## 明确不包含

P1 不包含：

- 自由文本 Tag/SQL 查询语言。
- OR、NOT、嵌套条件组或跨 Span 条件。
- 动态 Attribute Key/Value 全库扫描和自动补全接口。
- Attribute 展开表、倒排索引、物化视图或投影。
- Trace Compare、导入、归档和导出。
- Service Map 聚焦跳数和异常边重构。
- Jaeger 独立 SPM 页面或新的指标存储。
- 提交、推送、发布、部署和目标环境压测。

## 完成标准

P1-A 完成需要同时满足：

- 数据契约、校验、SQL 语义和 UI 行为全部实现。
- 后端、前端纯函数、ClickHouse 语义和浏览器验收通过。
- 基础 Trace 查询完全兼容。
- 代码审查没有剩余 Critical/Important 问题。

P1-B 完成需要同时满足：

- 四类调查目标使用共享 Context 生成器。
- 时间窗和实体过滤可通过 URL 刷新恢复。
- Metrics Operation 跳转使用同 Span 语义。
- Span、Log、Metrics、Service Map 的动作与禁用规则通过浏览器验收。
- 代码审查没有剩余 Critical/Important 问题。

P1 总体完成必须先完成 P1-A，再完成 P1-B。提交、推送、部署和生产性能验证仍是独立授权阶段。
