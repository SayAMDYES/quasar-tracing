# Spring Boot + OpenTelemetry Collector — 最佳实践示例

一个小巧、**可直接运行**的 Spring Boot 服务，演示如何使用 **OpenTelemetry Java Agent**
将真实应用接入 Quasar Tracing 流水线。它把 traces、logs、metrics 发送到 `deploy/simple/`
中的 OTel Collector，由其经 Kafka 分发进 ClickHouse，最终被平台 API 与控制面板读取展示。

> **English doc** → [../../example/springboot/README.md](../../example/springboot/README.md)

---

## 本示例演示了什么

| # | 最佳实践 | 方式 |
|---|---|---|
| 1 | **Agent 自动埋点** | JVM 启动时挂载 Java Agent —— 应用中没有任何埋点代码。HTTP 服务端/客户端、线程、日志都被自动埋点。 |
| 2 | **日志关联** | Agent 把 `trace_id`/`span_id` 注入 SLF4J MDC，**并**将日志桥接到 OTLP，因此每条日志都会进入 ClickHouse `logs` 表并关联到它所属的 trace。 |
| 3 | **手动埋点** | `@WithSpan` / `@SpanAttribute` 配合 `Span.current()` 补充 Agent 无法推断的业务 span、属性、事件与错误状态。 |
| 4 | **指标** | JVM 与 `http.server.*` 指标自动采集；自定义 Micrometer `Counter` 被桥接到 OTLP，落入 `otel_metrics_sum`。 |
| 5 | **生产调优** | 资源属性、采样、批处理、gRPC 与 HTTP 选择，以及容器/K8s 说明。 |

### 请求链路（一条 trace）

`POST /orders` 会产生一条完整的 **SERVER → CLIENT → SERVER** span 链，并与该请求产生的
日志相互关联：

```
POST /orders                         (SERVER span — 自动)
└─ OrderService.placeOrder           (INTERNAL span — @WithSpan)
   └─ GET /internal/inventory/{sku}  (CLIENT span — 自动，RestClient)
      └─ GET /internal/inventory     (SERVER span — 自动，上下文已传播)
```

下游调用是服务**调用自身**完成的，因此示例完全自包含 —— 无需第二个服务，也无需访问外网。

---

## 它在流水线中的位置

```
springboot-otel-sample  (本应用，:8090，OTel Java Agent)
        │  OTLP  (宿主机: HTTP :4318 · 容器内: gRPC :4317)
        ▼
   OTel Collector ──▶ Kafka ──▶ OTel Exporter ──▶ ClickHouse ──▶ Platform API ──▶ Control Panel
   (deploy/simple)     traces/logs/metrics            quasar_tracing      :8080          :5173
```

---

## 前置条件

1. **中间件栈已启动**且 **Kafka topics 已创建**。从仓库根目录，按
   [根 README](../../README.md) 的第 1–2 步操作：
   ```bash
   cd deploy/simple && docker compose up -d
   # 然后创建 otel-traces / otel-logs / otel-metrics 三个 topic（根 README 第 2 步）
   ```
2. 宿主机上具备 **JDK 17** 与 **Maven 3.8+**（用于 `run.sh` / `run.ps1`），或具备 **Docker**
   （用于 compose 方式）。

---

## 项目结构

```
example/springboot/
├── pom.xml                 Spring Boot 3.5.7 · Java 17 · OTel instrumentation BOM
├── Dockerfile              多阶段构建；把 agent 下载进镜像
├── docker-compose.yml      让应用运行在 deploy/simple 的网络上
├── run.sh / run.ps1        宿主机运行脚本（下载 agent → 构建 → java -javaagent）
└── src/main/
    ├── java/org/quasar/tracing/example/
    │   ├── OtelSampleApplication.java   无埋点代码 —— 全部由 agent 完成
    │   ├── web/OrderController.java      REST 接口 + 结构化日志
    │   ├── service/OrderService.java     @WithSpan、自定义属性/事件、Micrometer 计数器
    │   ├── service/InventoryClient.java  RestClient 调用 → 自动 CLIENT span + 上下文传播
    │   └── config/RestClientConfig.java  RestClient bean
    └── resources/
        ├── application.yml               应用名、actuator、日志级别
        └── logback-spring.xml            控制台日志格式带 trace_id / span_id
```

---

## 1. Agent 自动埋点

接入 Spring Boot 应用最干净的方式，是**完全不改动应用**。在 JVM 启动时挂载 agent，它会自动
为 Spring MVC、`RestClient`/`RestTemplate`/`WebClient`、JDBC、Kafka、Redis 等埋点，无需任何
代码改动。

```bash
java \
  -javaagent:/path/to/opentelemetry-javaagent.jar \
  -Dotel.service.name=springboot-otel-sample \
  -Dotel.resource.attributes=service.namespace=quasar-tracing,service.version=1.0.0,deployment.environment.name=local \
  -Dotel.exporter.otlp.endpoint=http://localhost:4318 \
  -Dotel.exporter.otlp.protocol=http/protobuf \
  -jar target/springboot-otel-sample.jar
```

**最佳实践**

- **务必设置 `service.name`。** 它是平台各处（trace 搜索、服务地图、指标）的主标识。不设置
  会得到 `unknown_service:java`。
- **设置资源属性** —— `service.namespace`、`service.version`，尤其是
  `deployment.environment.name` —— 以便区分 prod/staging/local，并把回归问题关联到具体发布版本。
- **固定 agent 版本**以保证构建可复现；`Dockerfile` 中给出了写法。从
  [releases 页面](https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases)
  下载。
- agent **完全独立于构建** —— 它绝不是 Maven 依赖，也不入库。`run.sh` / `run.ps1` 会在首次
  运行时下载它。

> **备选方案：** [OpenTelemetry Spring Boot starter](https://opentelemetry.io/docs/zero-code/java/spring-boot-starter/)
> 无需 agent jar 即可埋点（适合 GraalVM 原生镜像）。本仓库统一采用 agent 方案，故本示例也使用
> agent。

---

## 2. 日志关联

这是流水线的核心承诺：**一条日志能回溯到产生它的那个 span。** 使用 agent 可零成本获得：

- **`logback-mdc` 埋点**（默认开启）把 `trace_id`、`span_id`、`trace_flags` 注入 SLF4J MDC。
  `logback-spring.xml` 在控制台格式中引用它们，使本地日志可读且自带关联：
  ```
  2026-06-15 10:00:00.123 INFO  [http-nio-8090-exec-1] o.q.t.e.web.OrderController [trace_id=4bf92f... span_id=00f067...] - Order accepted: 5f2c...
  ```
- **`logback-appender` 埋点**（默认开启）把同样的日志事件桥接到 OTLP。它们经
  Collector → Kafka → ClickHouse，落入 `logs` 表且 **`TraceId` 已填充**，因此控制面板可以展示
  “该 trace 的关联日志”。

你只需写普通的 SLF4J 代码：

```java
log.info("Received order: sku={}, quantity={}", request.sku(), request.quantity());
```

**最佳实践**

- 不要手动把 trace 上下文拼进日志字符串 —— 交给 agent 自动附加。
- 记录业务标识（订单号、sku），**绝不记录敏感信息**（token、密码、PII）。
- 生产环境需要 JSON 标准输出日志时，Spring Boot 3.4+ 内置结构化日志
  （`logging.structured.format.console=ecs`），MDC 中的 `trace_id`/`span_id` 会被自动包含。
  （本示例为保持本地控制台可读而未启用。）

---

## 3. 手动埋点

自动埋点捕获框架边界；**手动 span 捕获你的业务领域。** `OrderService` 展示了最常用的三件事：

```java
@WithSpan("OrderService.placeOrder")                       // 为业务方法创建 span
public String placeOrder(@SpanAttribute("order.sku") String sku,   // 捕获参数
                         @SpanAttribute("order.quantity") int quantity) {
    Span span = Span.current();
    span.setAttribute("inventory.available", available);   // 丰富当前 span
    span.addEvent("inventory.insufficient");               // 时间线标记
    span.setStatus(StatusCode.ERROR, "insufficient inventory"); // 标记失败
    ...
}
```

- `@WithSpan` / `@SpanAttribute` 来自 `opentelemetry-instrumentation-annotations`（仅编译期
  API；运行时由 agent 提供）。
- `Span.current()`（来自 `opentelemetry-api`）可丰富当前活跃 span —— 对自动和手动 span 都
  适用。

**最佳实践**

- span 名称应**低基数**（`OrderService.placeOrder`），而非按请求变化的字符串。把可变内容
  （`order.id`）放进属性。
- 给属性键加命名空间（`order.*`、`inventory.*`）以避免冲突。
- 失败时设置 `StatusCode.ERROR` —— 它驱动平台的错误 trace 索引。

---

## 4. 指标

- **自动：** 在 `-Dotel.metrics.exporter=otlp`（agent 默认值）下，JVM 指标（堆、GC、线程）和
  `http.server.*` 请求指标无需代码即可导出。
- **自定义：** 使用 **Micrometer** —— Spring 中惯用的指标 API。agent 的 `micrometer` 埋点把
  Micrometer 指标桥接到 OTLP，因此一个 `Counter` 会变成 OTel sum：
  ```java
  ordersPlaced = Counter.builder("orders.placed")
      .description("Total orders accepted").baseUnit("orders").register(meterRegistry);
  ...
  ordersPlaced.increment();
  ```
  它会以 `orders.placed` 落入 ClickHouse `otel_metrics_sum`。

**最佳实践**

- 在 Spring 应用中优先使用 Micrometer 而非原生 OTel 指标 API —— Actuator 已提供
  `MeterRegistry`，且保持可移植。
- 本示例显式设置 `otel.instrumentation.micrometer.enabled=true`，让桥接行为明确无歧义。
- 控制指标 **tag** 的基数（不要把订单号/用户号作为 tag）。

---

## 5. 生产调优

本地默认值偏向“看得见”，生产则偏向成本与开销控制。

| 关注点 | 本地（本示例） | 生产建议 |
|---|---|---|
| **采样** | `parentbased_always_on`（全量采集） | `parentbased_traceidratio` 配合 `OTEL_TRACES_SAMPLER_ARG=0.1`（采样 10%，整条 trace 保留） |
| **传输** | 宿主机 HTTP `:4318` | 集群内 gRPC `:4317`（开销更低）；Dockerfile/compose 使用 gRPC |
| **批处理** | agent 默认值 | 高吞吐下调优 `OTEL_BSP_MAX_EXPORT_BATCH_SIZE` / `OTEL_BSP_SCHEDULE_DELAY` |
| **压缩** | 关闭 | 跨网络时 `OTEL_EXPORTER_OTLP_COMPRESSION=gzip` |
| **认证/请求头** | 无（本地） | 面向受保护的 collector 设置 `OTEL_EXPORTER_OTLP_HEADERS=authorization=...` |
| **资源属性** | `deployment.environment.name=local` | 注入真实的 `service.version`（构建标签）与各环境的 `deployment.environment.name` |

在 Kubernetes 中，通过 Deployment 的环境变量（或 OpenTelemetry Operator 的自动注入）设置这些值，
并把 Collector 作为 DaemonSet 运行 —— 应用配置完全一致，只是 endpoint 不同。

---

## 运行

### 方式 A —— 宿主机（HTTP → `localhost:4318`）

```bash
# bash
./run.sh
```
```powershell
# PowerShell
./run.ps1
```

脚本会（首次）下载 agent、执行 `mvn package`，并在挂载 agent 的情况下启动应用。

### 方式 B —— Docker，运行在栈网络上（gRPC → `otel-collector:4317`）

```bash
cd example/springboot
docker compose up --build
```

compose 文件会加入 `deploy/simple` 的网络，使容器能按服务名访问 collector。若你的 compose
项目名不是 `simple`，用 `docker network ls` 找到网络名并更新 `docker-compose.yml`。

---

## 端到端验证

### 1. 产生流量

```bash
# 正常路径（库存恒为 50..99，故 quantity <= 50 会成功）
curl -s -X POST http://localhost:8090/orders \
  -H "Content-Type: application/json" \
  -d '{"sku":"WIDGET-1","quantity":2}'

# 错误路径（数量过大 → 库存不足 → 错误 span）
curl -s -X POST http://localhost:8090/orders \
  -H "Content-Type: application/json" \
  -d '{"sku":"WIDGET-1","quantity":999}'
```

### 2. 查询 ClickHouse（约 10 秒后 —— 批量刷新）

```bash
# Traces —— 期望看到同一条 trace 的 SERVER/INTERNAL/CLIENT spans
docker exec -it simple-clickhouse-1 clickhouse-client --user admin --password quasar-dev-password --query \
"SELECT Timestamp, SpanName, SpanKind FROM quasar_tracing.spans \
 WHERE ServiceName='springboot-otel-sample' ORDER BY Timestamp DESC LIMIT 10"

# Logs —— 注意 TraceId 已填充，因此日志可关联到 trace
docker exec -it simple-clickhouse-1 clickhouse-client --user admin --password quasar-dev-password --query \
"SELECT Timestamp, SeverityText, TraceId, Body FROM quasar_tracing.logs \
 WHERE ServiceName='springboot-otel-sample' ORDER BY Timestamp DESC LIMIT 10"

# Metrics —— 自定义计数器（若名称带单位后缀，用 DISTINCT 查询确认）
docker exec -it simple-clickhouse-1 clickhouse-client --user admin --password quasar-dev-password --query \
"SELECT DISTINCT MetricName FROM quasar_tracing.otel_metrics_sum WHERE MetricName LIKE 'orders%'"
```

### 3. 在控制面板查看

在平台 API（`:8080`）与控制面板（`:5173`）已运行的前提下（根 README 第 6–7 步），打开
<http://localhost:5173>，然后：

- **Traces** → 搜索服务 `springboot-otel-sample`；打开一条 trace 查看 span 树及其**关联日志**。
- **Service map** → 该服务作为一个节点出现（库存这一跳会形成一条指向自身的边）。
- **Metrics** → 查看该服务的 JVM 与请求指标。

---

## 配置参考

本示例用到的全部开关（系统属性 → 环境变量形式）：

| 系统属性 | 环境变量 | 本示例取值 | 用途 |
|---|---|---|---|
| `otel.service.name` | `OTEL_SERVICE_NAME` | `springboot-otel-sample` | 服务标识 |
| `otel.resource.attributes` | `OTEL_RESOURCE_ATTRIBUTES` | `service.namespace=…,service.version=…,deployment.environment.name=…` | 资源标签 |
| `otel.exporter.otlp.endpoint` | `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` / `http://otel-collector:4317` | Collector 地址 |
| `otel.exporter.otlp.protocol` | `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` / `grpc` | OTLP 传输方式 |
| `otel.traces.sampler` | `OTEL_TRACES_SAMPLER` | `parentbased_always_on` | 采样策略 |
| `otel.traces.sampler.arg` | `OTEL_TRACES_SAMPLER_ARG` | *(生产：`0.1`)* | 采样比例 |
| `otel.instrumentation.micrometer.enabled` | `OTEL_INSTRUMENTATION_MICROMETER_ENABLED` | `true` | 桥接 Micrometer → OTLP |

---

## 故障排查

| 现象 | 可能原因 |
|---|---|
| ClickHouse 中没有 spans | Kafka topic 未创建（`AUTO_CREATE_TOPICS_ENABLE=false`）—— 见根 README 第 2 步。 |
| 应用启动但什么都不导出 | 未挂载 agent（缺少 `-javaagent`），或 `OTLP_ENDPOINT`/协议不对（HTTP→4318，gRPC→4317）。 |
| 有日志但 `TraceId` 为空 | 该日志在任何 span 之外产生（例如启动阶段）—— 这是正常的；请求内的日志会带上 id。 |
| 自定义指标缺失 | 稍等指标导出周期；确认 `otel.instrumentation.micrometer.enabled=true`。 |
| 连接 collector 报 `Connection refused` | 宿主机运行须用 `localhost:4318`；容器运行须在栈网络上用 `otel-collector:4317`。 |

如有疑问，检查 collector：
```bash
cd deploy/simple
docker compose logs otel-collector --tail=30
docker compose logs otel-exporter --tail=30
```
