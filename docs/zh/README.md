# quasar-tracing

一个面向 Java/Spring Boot 服务的端到端可观测性平台。它通过 OpenTelemetry 接入
traces、logs 和 metrics，将数据存储到 ClickHouse，通过 Spring Boot 后端暴露只读
API，并在 React 控制面板中展示。

> **中文文档** → [docs/zh/README.md](docs/zh/README.md)

---

## 架构

```
Spring Boot 应用 (OTel Java Agent)
        │  OTLP (gRPC / HTTP)
        ▼
┌─────────────────────┐
│   OTel Collector    │  采集层 — 接收 OTLP，分发到 Kafka
└──────────┬──────────┘
           │  (按信号：otlp_proto / otlp_json)
           ▼
     ┌───────────┐
     │   Kafka   │  缓冲层 — otel-traces / otel-logs / otel-metrics
     └─────┬─────┘
           │
           ▼
┌──────────────────────┐
│  OTel Collector      │  批量写入层 — Kafka → ClickHouse
│  Exporter             │  (traces + logs + metrics)
└──────────┬───────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│               ClickHouse                     │  存储层
│  明细: spans · logs · otel_metrics_*        │
│  索引: spans_trace_id_ts · trace_error      │
│  汇总: trace_summary · service_endpoint     │
│        service_dependency · log_summary      │
│        metric_series_index                   │
└────────────────────────┬────────────────────┘
                         │  (只读查询)
                ┌────────┴────────┐
                │ Platform API    │  Spring Boot 后端 (:8080)
                │ (read-only)     │
                └────────┬────────┘
                         │  /api/*
                ┌────────┴────────┐
                │ Control Panel   │  React + Vite 前端 (:5173)
                └─────────────────┘
```

---

## 前置条件

| 工具 | 最低版本 | 说明 |
|---|---|---|
| Docker Desktop / Docker Engine | 24.x | 需要 Docker Compose v2 |
| Docker Compose | v2 | 本地中间件栈 |
| JDK | 17 | 平台后端 |
| Maven | 3.8+ | 平台后端构建 |
| Node.js | 18+ | 控制面板前端 |

```bash
docker --version
docker compose version
java -version
mvn -version
node --version
```

---

## 本地运行

### 1. 启动中间件栈

```bash
# 从仓库根目录执行
cd deploy/simple
docker compose up -d
```

服务按以下顺序启动，每个服务都会等待其依赖项健康：

```
kafka (healthy)          ← KRaft 模式，无 ZooKeeper
    ├─▶ clickhouse
    ├─▶ otel-collector   — OTLP 接收器 → Kafka (traces/logs/metrics)
    └─▶ otel-exporter    — Kafka → ClickHouse (traces/logs/metrics)
```

确认所有容器都在运行：

```bash
docker compose ps
```

### 2. 创建 Kafka topics

Topic 必须手动创建（`AUTO_CREATE_TOPICS_ENABLE=false`）：

```bash
docker exec -it simple-kafka-1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka:9092 --create --topic otel-traces \
  --partitions 3 --replication-factor 1

docker exec -it simple-kafka-1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka:9092 --create --topic otel-logs \
  --partitions 3 --replication-factor 1

docker exec -it simple-kafka-1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka:9092 --create --topic otel-metrics \
  --partitions 3 --replication-factor 1
```

验证：

```bash
docker exec -it simple-kafka-1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka:9092 --list
```

预期：`otel-logs`、`otel-metrics`、`otel-traces`

### 3. 验证 ClickHouse 表

```bash
docker exec -it simple-clickhouse-1 clickhouse-client \
  --user admin --password quasar-dev-password \
  --query "SHOW TABLES FROM quasar_tracing"
```

明细表（`spans`、`logs`、`otel_metrics_*`）由 OTel Exporter 自动创建
（`create_schema: true`）。聚合表和物化视图由 SQL 初始化脚本预先创建。

### 4. 发送测试 trace

```bash
curl -s -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [{"key": "service.name", "value": {"stringValue": "test-service"}}]
      },
      "scopeSpans": [{
        "scope": {"name": "test"},
        "spans": [{
          "traceId": "aabbccddeeff00112233445566778899",
          "spanId": "aabbccddeeff0011",
          "name": "test-span",
          "kind": 1,
          "startTimeUnixNano": "'$(date +%s)000000000'",
          "endTimeUnixNano":   "'$(($(date +%s)+1))000000000'",
          "status": {"code": 1}
        }]
      }]
    }]
  }'
```

约 10 秒后（批量刷新间隔），查询 ClickHouse：

```bash
docker exec -it simple-clickhouse-1 clickhouse-client \
  --user admin --password quasar-dev-password \
  --query "SELECT TraceId, SpanName, ServiceName FROM quasar_tracing.spans LIMIT 5"
```

### 5. 验证 OTel Collector 和 Exporter

```bash
docker compose logs otel-collector --tail=20
docker compose logs otel-exporter --tail=20
```

查找：`Everything is ready. Begin running and processing data.`

### 6. 启动平台 API

在一个新终端中，从仓库根目录执行：

```bash
cd platform
mvn -pl quasar-tracing-server -am spring-boot:run
```

API 监听 `http://localhost:8080`，并使用下方凭据读取 ClickHouse。

### 7. 启动控制面板

在另一个终端中，从仓库根目录执行：

```bash
npm install --prefix control-panel
npm run dev --prefix control-panel
```

打开 `http://localhost:5173`。Vite 开发服务器会把 `/api/*` 代理到
`http://127.0.0.1:8080`。

---

## 接入 Spring Boot 应用

在服务启动命令中添加 OTel Java Agent：

```bash
java \
  -javaagent:/path/to/opentelemetry-javaagent.jar \
  -Dotel.service.name=your-service-name \
  -Dotel.resource.attributes=service.namespace=your-namespace,service.version=1.0.0,deployment.environment.name=local \
  -Dotel.exporter.otlp.endpoint=http://localhost:4318 \
  -Dotel.exporter.otlp.protocol=http/protobuf \
  -Dotel.logs.exporter=otlp \
  -Dotel.metrics.exporter=otlp \
  -jar your-app.jar
```

或通过环境变量：

```bash
export OTEL_SERVICE_NAME=your-service-name
export OTEL_RESOURCE_ATTRIBUTES=service.namespace=your-namespace,service.version=1.0.0,deployment.environment.name=local
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_LOGS_EXPORTER=otlp
export OTEL_METRICS_EXPORTER=otlp
```

下载 agent：https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases

---

## 停止和重置

```bash
# 停止所有容器，保留数据
cd deploy/simple
docker compose down

# 完全重置 — 停止并清除所有持久化数据
docker compose down -v
Remove-Item data/kafka/* -Recurse -Force
```

---

## 端口参考

| 服务 | 端口 | 协议 | 用途 |
|---|---|---|---|
| Kafka | 29092 | PLAINTEXT | Broker（宿主机访问） |
| Kafka | 9092 | PLAINTEXT | Broker（容器内部网络） |
| ClickHouse | 8123 | HTTP | 客户端查询 |
| ClickHouse | 9000 | Native TCP | OTel Exporter 写入 |
| OTel Collector | 4317 | gRPC | OTLP 接入 |
| OTel Collector | 4318 | HTTP | OTLP 接入 |
| Platform API | 8080 | HTTP | Spring Boot 只读 API |
| Control Panel | 5173 | HTTP | Vite 开发服务器 |

## ClickHouse 凭据

| 参数 | 值 |
|---|---|
| Host | localhost |
| HTTP Port | 8123 |
| Native Port | 9000 |
| Database | quasar_tracing |
| Username | admin |
| Password | quasar-dev-password |

## ClickHouse Schema 概览

| 表 | 类型 | TTL | 用途 |
|---|---|---|---|
| `spans` | 明细表 (MergeTree) | 3 天 | OTel trace spans |
| `spans_trace_id_ts` | 索引表 (MV from spans) | 3 天 | 快速 TraceId → 时间范围查找 |
| `logs` | 明细表 (MergeTree) | 3 天 | OTel log records |
| `otel_metrics_*` (×5) | 明细表 (MergeTree) | 3 天 | OTel gauge/sum/histogram/exp-histogram/summary |
| `trace_summary` | 汇总表 (ReplacingMergeTree) | 30 天 | Trace 列表 / 搜索 |
| `span_service_index` | 索引表 (MV from spans) | 3 天 | 用于依赖 JOIN 的轻量 span 索引 |
| `service_dependency` | span_service_index 上的视图 | — | 服务调用依赖图 |
| `service_endpoint_summary` | 聚合表 (AggregatingMergeTree) | 30 天 | 每个 endpoint 的 RED 指标 |
| `log_summary` | 聚合表 (AggregatingMergeTree) | 30 天 | 每个服务 + severity 的日志数量 |
| `metric_series_index` | 聚合表 (AggregatingMergeTree) | 90 天 | Metric series 发现 |
| `trace_error_index` | 索引表 (MergeTree) | 7 天 | 错误 trace 快速查找 |
