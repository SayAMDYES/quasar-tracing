# Spring Boot + OpenTelemetry Collector — Best-Practice Example

A small, **runnable** Spring Boot service that demonstrates how to instrument a real
application for the Quasar Tracing pipeline using the **OpenTelemetry Java Agent**. It sends
traces, logs, and metrics to the OTel Collector from `deploy/simple/`, which fans them out
through Kafka into ClickHouse, where the platform API and control panel read them.

> **中文文档** → [../../docs/zh/example.md](../../docs/zh/example.md)

---

## What this demonstrates

| # | Best practice | How |
|---|---|---|
| 1 | **Agent auto-instrumentation** | Attach the Java agent at JVM start — zero tracing code in the app. HTTP server/client, threads, and logging are instrumented automatically. |
| 2 | **Log correlation** | The agent injects `trace_id`/`span_id` into the SLF4J MDC **and** bridges logs to OTLP, so every log lands in the ClickHouse `logs` table joined to its trace. |
| 3 | **Manual instrumentation** | `@WithSpan` / `@SpanAttribute` plus `Span.current()` add domain spans, attributes, events, and error status the agent can't infer. |
| 4 | **Metrics** | JVM + `http.server.*` metrics are automatic; a custom Micrometer `Counter` is bridged to OTLP and lands in `otel_metrics_sum`. |
| 5 | **Production tuning** | Resource attributes, sampling, batching, gRPC-vs-HTTP, and container/K8s notes. |

### The request flow (one trace)

`POST /orders` produces a single trace with a **SERVER → CLIENT → SERVER** span chain, all
correlated to the logs the request emits:

```
POST /orders                         (SERVER span — auto)
└─ OrderService.placeOrder           (INTERNAL span — @WithSpan)
   └─ GET /internal/inventory/{sku}  (CLIENT span — auto, RestClient)
      └─ GET /internal/inventory     (SERVER span — auto, context propagated)
```

The service calls **itself** for the downstream hop, so the example is self-contained — no
second service or internet access required.

---

## Where it sits in the pipeline

```
springboot-otel-sample  (this app, :8090, OTel Java Agent)
        │  OTLP  (host: HTTP :4318 · in-network: gRPC :4317)
        ▼
   OTel Collector ──▶ Kafka ──▶ OTel Exporter ──▶ ClickHouse ──▶ Platform API ──▶ Control Panel
   (deploy/simple)     traces/logs/metrics            quasar_tracing      :8080          :5173
```

---

## Prerequisites

1. **The middleware stack is running** and **Kafka topics exist**. From the repo root, follow
   the [root README](../../README.md) steps 1–2:
   ```bash
   cd deploy/simple && docker compose up -d
   # then create the otel-traces / otel-logs / otel-metrics topics (root README, step 2)
   ```
2. **JDK 17** and **Maven 3.8+** on the host (for `run.sh` / `run.ps1`), or **Docker** (for the
   compose option).

---

## Project layout

```
example/springboot/
├── pom.xml                 Spring Boot 3.5.7 · Java 17 · OTel instrumentation BOM
├── Dockerfile              multi-stage build; downloads the agent into the image
├── docker-compose.yml      runs the app on deploy/simple's network
├── run.sh / run.ps1        host run helpers (download agent → build → java -javaagent)
└── src/main/
    ├── java/org/quasar/tracing/example/
    │   ├── OtelSampleApplication.java   no tracing code — the agent does it all
    │   ├── web/OrderController.java      REST endpoints + structured logs
    │   ├── service/OrderService.java     @WithSpan, custom attributes/events, Micrometer counter
    │   ├── service/InventoryClient.java  RestClient call → auto CLIENT span + context propagation
    │   └── config/RestClientConfig.java  RestClient bean
    └── resources/
        ├── application.yml               app name, actuator, log levels
        └── logback-spring.xml            console pattern with trace_id / span_id
```

---

## 1. Agent auto-instrumentation

The cleanest way to instrument a Spring Boot app is to **not touch the app**. Attach the agent
at JVM start; it instruments Spring MVC, `RestClient`/`RestTemplate`/`WebClient`, JDBC, Kafka,
Redis, and more — with no code changes.

```bash
java \
  -javaagent:/path/to/opentelemetry-javaagent.jar \
  -Dotel.service.name=springboot-otel-sample \
  -Dotel.resource.attributes=service.namespace=quasar-tracing,service.version=1.0.0,deployment.environment.name=local \
  -Dotel.exporter.otlp.endpoint=http://localhost:4318 \
  -Dotel.exporter.otlp.protocol=http/protobuf \
  -jar target/springboot-otel-sample.jar
```

**Best practices**

- **Always set `service.name`.** It is the primary identity everywhere in the platform
  (trace search, service map, metrics). Without it you get `unknown_service:java`.
- **Set resource attributes** — `service.namespace`, `service.version`, and especially
  `deployment.environment.name` — so you can separate prod/staging/local and correlate a regression
  to a release.
- **Pin the agent version** for reproducible builds; the `Dockerfile` shows how. Download it
  from the [releases page](https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases).
- The agent is **fully external** to the build — it is never a Maven dependency and never
  committed. `run.sh` / `run.ps1` download it on first run.

> **Alternative:** the [OpenTelemetry Spring Boot starter](https://opentelemetry.io/docs/zero-code/java/spring-boot-starter/)
> instruments without an agent jar (useful for GraalVM native images). This repo standardizes on
> the agent, so that is what this example uses.

---

## 2. Log correlation

This is the pipeline's core promise: **a log line can be traced back to the exact span that
produced it.** With the agent, you get it for free:

- **`logback-mdc` instrumentation** (on by default) injects `trace_id`, `span_id`, and
  `trace_flags` into the SLF4J MDC. `logback-spring.xml` references them so local console logs
  are correlated and human-readable:
  ```
  2026-06-15 10:00:00.123 INFO  [http-nio-8090-exec-1] o.q.t.e.web.OrderController [trace_id=4bf92f... span_id=00f067...] - Order accepted: 5f2c...
  ```
- **`logback-appender` instrumentation** (on by default) bridges the same log events to OTLP.
  They flow Collector → Kafka → ClickHouse and land in the `logs` table **with `TraceId`
  populated**, so the control panel can show "logs for this trace."

You write ordinary SLF4J:

```java
log.info("Received order: sku={}, quantity={}", request.sku(), request.quantity());
```

**Best practices**

- Don't build trace context into log strings by hand — let the agent attach it.
- Log business identifiers (order id, sku), **never secrets** (tokens, passwords, PII).
- For JSON stdout logs in production, Spring Boot 3.4+ has built-in structured logging
  (`logging.structured.format.console=ecs`); the MDC `trace_id`/`span_id` are included
  automatically. (Omitted here to keep the local console readable.)

---

## 3. Manual instrumentation

Auto-instrumentation captures framework boundaries; **manual spans capture your domain.**
`OrderService` shows the three things you reach for most:

```java
@WithSpan("OrderService.placeOrder")                       // a span around a business method
public String placeOrder(@SpanAttribute("order.sku") String sku,   // capture an argument
                         @SpanAttribute("order.quantity") int quantity) {
    Span span = Span.current();
    span.setAttribute("inventory.available", available);   // enrich the current span
    span.addEvent("inventory.insufficient");               // timeline marker
    span.setStatus(StatusCode.ERROR, "insufficient inventory"); // mark failure
    ...
}
```

- `@WithSpan` / `@SpanAttribute` come from `opentelemetry-instrumentation-annotations` (a
  compile-only API; the agent supplies the runtime).
- `Span.current()` (from `opentelemetry-api`) enriches whatever span is active — works for both
  auto and manual spans.

**Best practices**

- Span names are **low-cardinality** (`OrderService.placeOrder`), not per-request strings. Put
  the variable bits (`order.id`) in attributes.
- Namespace attribute keys (`order.*`, `inventory.*`) to avoid collisions.
- Set `StatusCode.ERROR` on failures — it's what drives the platform's error trace index.

---

## 4. Metrics

- **Automatic:** with `-Dotel.metrics.exporter=otlp` (the agent default), JVM metrics (heap,
  GC, threads) and `http.server.*` request metrics export with no code.
- **Custom:** use **Micrometer** — the idiomatic Spring metrics API. The agent's `micrometer`
  instrumentation bridges Micrometer meters to OTLP, so a `Counter` becomes an OTel sum:
  ```java
  ordersPlaced = Counter.builder("orders.placed")
      .description("Total orders accepted").baseUnit("orders").register(meterRegistry);
  ...
  ordersPlaced.increment();
  ```
  It lands in ClickHouse `otel_metrics_sum` as `orders.placed`.

**Best practices**

- Prefer Micrometer over the raw OTel metrics API in Spring apps — Actuator already provides a
  `MeterRegistry`, and you stay portable.
- The example sets `otel.instrumentation.micrometer.enabled=true` explicitly so the bridge is
  unambiguous.
- Keep metric **tag** cardinality bounded (no order ids / user ids as tags).

---

## 5. Production tuning

The local defaults favor visibility; production favors cost and overhead control.

| Concern | Local (this example) | Production guidance |
|---|---|---|
| **Sampling** | `parentbased_always_on` (capture everything) | `parentbased_traceidratio` with `OTEL_TRACES_SAMPLER_ARG=0.1` (sample 10%, keep whole traces) |
| **Transport** | HTTP `:4318` on host | gRPC `:4317` in-cluster (lower overhead); the Dockerfile/compose use gRPC |
| **Batching** | agent defaults | tune `OTEL_BSP_MAX_EXPORT_BATCH_SIZE` / `OTEL_BSP_SCHEDULE_DELAY` under high throughput |
| **Compression** | off | `OTEL_EXPORTER_OTLP_COMPRESSION=gzip` over the network |
| **Auth/headers** | none (local) | `OTEL_EXPORTER_OTLP_HEADERS=authorization=...` for a secured collector |
| **Resource attrs** | `deployment.environment.name=local` | inject real `service.version` (build tag) and `deployment.environment.name` per env |

In Kubernetes, set these via env vars on the Deployment (or the OpenTelemetry Operator's
auto-injection) and run the Collector as a DaemonSet — the app config is identical, only the
endpoint changes.

---

## Run it

### Option A — on the host (HTTP → `localhost:4318`)

```bash
# bash
./run.sh
```
```powershell
# PowerShell
./run.ps1
```

These download the agent (first run), `mvn package`, and launch with the agent attached.

### Option B — Docker, on the stack network (gRPC → `otel-collector:4317`)

```bash
cd example/springboot
docker compose up --build
```

The compose file joins `deploy/simple`'s network so the container reaches the collector by
name. If your compose project isn't named `simple`, find the network with `docker network ls`
and update `docker-compose.yml`.

---

## Verify end-to-end

### 1. Generate traffic

```bash
# Happy path (inventory is always 50..99, so quantity <= 50 succeeds)
curl -s -X POST http://localhost:8090/orders \
  -H "Content-Type: application/json" \
  -d '{"sku":"WIDGET-1","quantity":2}'

# Error path (large quantity → insufficient inventory → error span)
curl -s -X POST http://localhost:8090/orders \
  -H "Content-Type: application/json" \
  -d '{"sku":"WIDGET-1","quantity":999}'
```

### 2. Query ClickHouse (after ~10s — batch flush)

```bash
# Traces — expect the SERVER/INTERNAL/CLIENT spans of one trace
docker exec -it simple-clickhouse-1 clickhouse-client --user admin --password quasar-dev-password --query \
"SELECT Timestamp, SpanName, SpanKind FROM quasar_tracing.spans \
 WHERE ServiceName='springboot-otel-sample' ORDER BY Timestamp DESC LIMIT 10"

# Logs — note TraceId is populated, so logs join to the trace
docker exec -it simple-clickhouse-1 clickhouse-client --user admin --password quasar-dev-password --query \
"SELECT Timestamp, SeverityText, TraceId, Body FROM quasar_tracing.logs \
 WHERE ServiceName='springboot-otel-sample' ORDER BY Timestamp DESC LIMIT 10"

# Metrics — the custom counter (run the DISTINCT query if the name has a unit suffix)
docker exec -it simple-clickhouse-1 clickhouse-client --user admin --password quasar-dev-password --query \
"SELECT DISTINCT MetricName FROM quasar_tracing.otel_metrics_sum WHERE MetricName LIKE 'orders%'"
```

### 3. View in the control panel

With the platform API (`:8080`) and control panel (`:5173`) running (root README, steps 6–7),
open <http://localhost:5173> and:

- **Traces** → search service `springboot-otel-sample`; open a trace to see the span tree and
  its **related logs**.
- **Service map** → the service appears as a node (with a self-edge for the inventory hop).
- **Metrics** → JVM and request metrics for the service.

---

## Configuration reference

Every knob this example uses (system property → env var form):

| System property | Env var | Value here | Purpose |
|---|---|---|---|
| `otel.service.name` | `OTEL_SERVICE_NAME` | `springboot-otel-sample` | Service identity |
| `otel.resource.attributes` | `OTEL_RESOURCE_ATTRIBUTES` | `service.namespace=…,service.version=…,deployment.environment.name=…` | Resource tags |
| `otel.exporter.otlp.endpoint` | `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` / `http://otel-collector:4317` | Collector address |
| `otel.exporter.otlp.protocol` | `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` / `grpc` | OTLP transport |
| `otel.traces.sampler` | `OTEL_TRACES_SAMPLER` | `parentbased_always_on` | Sampling strategy |
| `otel.traces.sampler.arg` | `OTEL_TRACES_SAMPLER_ARG` | *(prod: `0.1`)* | Sampling ratio |
| `otel.instrumentation.micrometer.enabled` | `OTEL_INSTRUMENTATION_MICROMETER_ENABLED` | `true` | Bridge Micrometer → OTLP |

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| No spans in ClickHouse | Kafka topics not created (`AUTO_CREATE_TOPICS_ENABLE=false`) — see root README step 2. |
| App starts but nothing exports | Agent not attached (no `-javaagent`), or wrong `OTLP_ENDPOINT`/protocol (HTTP→4318, gRPC→4317). |
| Logs present but `TraceId` empty | The log was emitted outside any span (e.g. at startup) — that's expected; in-request logs carry the id. |
| Custom metric missing | Give it time (metric export interval); confirm `otel.instrumentation.micrometer.enabled=true`. |
| `Connection refused` to collector | Host run must use `localhost:4318`; container run must be on the stack network using `otel-collector:4317`. |

Inspect the collector if in doubt:
```bash
cd deploy/simple
docker compose logs otel-collector --tail=30
docker compose logs otel-exporter --tail=30
```
