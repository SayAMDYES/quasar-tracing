# quasar-tracing

An end-to-end observability platform for Java/Spring Boot services. It ingests traces,
logs, and metrics via OpenTelemetry, stores them in ClickHouse, exposes read APIs from a
Spring Boot backend, and renders them in the React control panel.

> **中文文档** → [docs/zh/README.md](docs/zh/README.md)

---

## Architecture

```
Spring Boot App (OTel Java Agent)
        │  OTLP (gRPC / HTTP)
        ▼
┌─────────────────────┐
│   OTel Collector    │  Collection Layer  — receives OTLP, fans out to Kafka
└──────────┬──────────┘
           │  (per-signal: otlp_proto / otlp_json)
           ▼
     ┌───────────┐
     │   Kafka   │  Buffering Layer   — otel-traces / otel-logs / otel-metrics
     └─────┬─────┘
           │
           ▼
┌──────────────────────┐
│  OTel Collector      │  Batch Write Layer  — Kafka → ClickHouse
│  Exporter             │  (traces + logs + metrics)
└──────────┬───────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│               ClickHouse                     │  Storage Layer
│  Detail: spans · logs · otel_metrics_*      │
│  Index:  spans_trace_id_ts · trace_error    │
│  Summary: trace_summary · service_endpoint  │
│           service_dependency · log_summary   │
│           metric_series_index                │
└────────────────────────┬────────────────────┘
                         │  (read-only queries)
                ┌────────┴────────┐
                │ Platform API    │  Spring Boot backend (:8080)
                │ (read-only)     │
                └────────┬────────┘
                         │  /api/*
                ┌────────┴────────┐
                │ Control Panel   │  React + Vite frontend (:5173)
                └─────────────────┘
```

---

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| Docker Desktop / Docker Engine | 24.x | Docker Compose v2 required |
| Docker Compose | v2 | Local middleware stack |
| JDK | 17 | Platform backend |
| Maven | 3.8+ | Platform backend build |
| Node.js | 18+ | Control panel frontend |

```bash
docker --version
docker compose version
java -version
mvn -version
node --version
```

---

## Run Locally

### 1. Start the middleware stack

```bash
# From the repository root
cd deploy/simple
docker compose up -d
```

Services start in the following order, each waiting for its dependency to be healthy:

```
kafka (healthy)          ← KRaft mode, no ZooKeeper
    ├─▶ clickhouse
    ├─▶ otel-collector   — OTLP receiver → Kafka (traces/logs/metrics)
    └─▶ otel-exporter    — Kafka → ClickHouse (traces/logs/metrics)
```

Verify all containers are running:

```bash
docker compose ps
```

### 2. Create Kafka topics

Topics must be created manually (`AUTO_CREATE_TOPICS_ENABLE=false`):

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

Verify:

```bash
docker exec -it simple-kafka-1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka:9092 --list
```

Expected: `otel-logs`, `otel-metrics`, `otel-traces`

### 3. Verify ClickHouse tables

```bash
docker exec -it simple-clickhouse-1 clickhouse-client \
  --user admin --password quasar-dev-password \
  --query "SHOW TABLES FROM quasar_tracing"
```

Detail tables (`spans`, `logs`, `otel_metrics_*`) are auto-created by the OTel exporter
(`create_schema: true`). Aggregation tables and materialized views are pre-created by the
SQL init scripts.

### 4. Send a test trace

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

After ~10 seconds (batch flush interval), query ClickHouse:

```bash
docker exec -it simple-clickhouse-1 clickhouse-client \
  --user admin --password quasar-dev-password \
  --query "SELECT TraceId, SpanName, ServiceName FROM quasar_tracing.spans LIMIT 5"
```

### 5. Verify OTel Collector & Exporter

```bash
docker compose logs otel-collector --tail=20
docker compose logs otel-exporter --tail=20
```

Look for: `Everything is ready. Begin running and processing data.`

### 6. Start the platform API

In a new terminal, from the repository root:

```bash
cd platform
mvn -pl quasar-tracing-server -am spring-boot:run
```

The API listens on `http://localhost:8080` and reads ClickHouse with the credentials
shown below.

### 7. Start the control panel

In another terminal, from the repository root:

```bash
npm install --prefix control-panel
npm run dev --prefix control-panel
```

Open `http://localhost:5173`. The Vite dev server proxies `/api/*` to
`http://127.0.0.1:8080`.

---

## Instrumenting a Spring Boot Application

Add the OTel Java Agent to your service's startup command:

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

Or via environment variables:

```bash
export OTEL_SERVICE_NAME=your-service-name
export OTEL_RESOURCE_ATTRIBUTES=service.namespace=your-namespace,service.version=1.0.0,deployment.environment.name=local
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_LOGS_EXPORTER=otlp
export OTEL_METRICS_EXPORTER=otlp
```

Download the agent: https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases

---

## Stopping & Resetting

```bash
# Stop all containers, keep data
cd deploy/simple
docker compose down

# Full reset — stop and wipe all persistent data
docker compose down -v
Remove-Item data/kafka/* -Recurse -Force
```

---

## Port Reference

| Service | Port | Protocol | Purpose |
|---|---|---|---|
| Kafka | 29092 | PLAINTEXT | Broker (host access) |
| Kafka | 9092 | PLAINTEXT | Broker (internal container network) |
| ClickHouse | 8123 | HTTP | Client queries |
| ClickHouse | 9000 | Native TCP | OTel Exporter writes |
| OTel Collector | 4317 | gRPC | OTLP ingestion |
| OTel Collector | 4318 | HTTP | OTLP ingestion |
| Platform API | 8080 | HTTP | Spring Boot read API |
| Control Panel | 5173 | HTTP | Vite dev server |

## ClickHouse Credentials

| Parameter | Value |
|---|---|
| Host | localhost |
| HTTP Port | 8123 |
| Native Port | 9000 |
| Database | quasar_tracing |
| Username | admin |
| Password | quasar-dev-password |

## ClickHouse Schema Overview

| Table | Type | TTL | Purpose |
|---|---|---|---|
| `spans` | Detail (MergeTree) | 3 days | OTel trace spans |
| `spans_trace_id_ts` | Index (MV from spans) | 3 days | Fast TraceId → time-range lookup |
| `logs` | Detail (MergeTree) | 3 days | OTel log records |
| `otel_metrics_*` (×5) | Detail (MergeTree) | 3 days | OTel gauge/sum/histogram/exp-histogram/summary |
| `trace_summary` | Summary (ReplacingMergeTree) | 30 days | Trace list / search |
| `span_service_index` | Index (MV from spans) | 3 days | Lightweight span index for dependency joins |
| `service_dependency` | View on span_service_index | — | Service call dependency map |
| `service_endpoint_summary` | Aggregation (AggregatingMergeTree) | 30 days | RED metrics per endpoint |
| `log_summary` | Aggregation (AggregatingMergeTree) | 30 days | Log count per service + severity |
| `metric_series_index` | Aggregation (AggregatingMergeTree) | 90 days | Metric series discovery |
| `trace_error_index` | Index (MergeTree) | 7 days | Error trace fast lookup |
