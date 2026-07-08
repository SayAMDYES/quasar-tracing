-- Storage Layer: ClickHouse span detail table
-- Schema aligned with otel-collector-contrib ClickHouse exporter v0.153.0
-- traces_table_name: spans
-- NOTE: When create_schema=true, the OTel Exporter will auto-create this table.
-- This DDL serves as a reference / fallback for manual setup.

CREATE TABLE IF NOT EXISTS quasar_tracing.spans
(
    Timestamp             DateTime64(9) CODEC(Delta(8), ZSTD(1)),
    TraceId               String CODEC(ZSTD(1)),
    SpanId                String CODEC(ZSTD(1)),
    ParentSpanId          String CODEC(ZSTD(1)),
    TraceState            String CODEC(ZSTD(1)),
    SpanName              LowCardinality(String) CODEC(ZSTD(1)),
    SpanKind              LowCardinality(String) CODEC(ZSTD(1)),
    ServiceName           LowCardinality(String) CODEC(ZSTD(1)),
    ResourceAttributes    Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    ScopeName             String CODEC(ZSTD(1)),
    ScopeVersion          String CODEC(ZSTD(1)),
    SpanAttributes        Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    Duration              UInt64 CODEC(ZSTD(1)),
    StatusCode            LowCardinality(String) CODEC(ZSTD(1)),
    StatusMessage         String CODEC(ZSTD(1)),
    `Events.Timestamp`    Array(DateTime64(9)) CODEC(ZSTD(1)),
    `Events.Name`         Array(LowCardinality(String)) CODEC(ZSTD(1)),
    `Events.Attributes`   Array(Map(LowCardinality(String), String)) CODEC(ZSTD(1)),
    `Links.TraceId`       Array(String) CODEC(ZSTD(1)),
    `Links.SpanId`        Array(String) CODEC(ZSTD(1)),
    `Links.TraceState`    Array(String) CODEC(ZSTD(1)),
    `Links.Attributes`    Array(Map(LowCardinality(String), String)) CODEC(ZSTD(1)),

    -- Materialized columns from ResourceAttributes for common query filters
    `__otel_materialized_service.namespace`          LowCardinality(String) MATERIALIZED ResourceAttributes['service.namespace'] CODEC(ZSTD(1)),
    `__otel_materialized_service.version`             LowCardinality(String) MATERIALIZED ResourceAttributes['service.version'] CODEC(ZSTD(1)),
    `__otel_materialized_deployment.environment.name` LowCardinality(String) MATERIALIZED ResourceAttributes['deployment.environment.name'] CODEC(ZSTD(1)),
    `__otel_materialized_host.name`                   LowCardinality(String) MATERIALIZED ResourceAttributes['host.name'] CODEC(ZSTD(1)),
    `__otel_materialized_k8s.cluster.name`            LowCardinality(String) MATERIALIZED ResourceAttributes['k8s.cluster.name'] CODEC(ZSTD(1)),
    `__otel_materialized_k8s.namespace.name`          LowCardinality(String) MATERIALIZED ResourceAttributes['k8s.namespace.name'] CODEC(ZSTD(1)),
    `__otel_materialized_k8s.pod.name`                LowCardinality(String) MATERIALIZED ResourceAttributes['k8s.pod.name'] CODEC(ZSTD(1)),
    `__otel_materialized_telemetry.sdk.language`      LowCardinality(String) MATERIALIZED ResourceAttributes['telemetry.sdk.language'] CODEC(ZSTD(1)),

    INDEX idx_trace_id        TraceId                    TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_res_attr_key    mapKeys(ResourceAttributes) TYPE bloom_filter(0.01)  GRANULARITY 1,
    INDEX idx_res_attr_value  mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_span_attr_key   mapKeys(SpanAttributes)    TYPE bloom_filter(0.01)  GRANULARITY 1,
    INDEX idx_span_attr_value mapValues(SpanAttributes)  TYPE bloom_filter(0.01)  GRANULARITY 1,
    INDEX idx_duration        Duration                   TYPE minmax              GRANULARITY 1
) ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (ServiceName, SpanName, toDateTime(Timestamp))
TTL toDateTime(Timestamp) + toIntervalDay(3)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;

-- Compact time-range index for trace lookup by TraceId
-- Aligned with otel-collector-contrib ClickHouse exporter v0.153.0
CREATE TABLE IF NOT EXISTS quasar_tracing.spans_trace_id_ts
(
    TraceId String CODEC(ZSTD(1)),
    Start   DateTime CODEC(Delta(4), ZSTD(1)),
    End     DateTime CODEC(Delta(4), ZSTD(1)),
    INDEX idx_trace_id TraceId TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = MergeTree
PARTITION BY toDate(Start)
ORDER BY (TraceId, Start)
TTL toDateTime(Start) + toIntervalDay(3)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS quasar_tracing.spans_trace_id_ts_mv
TO quasar_tracing.spans_trace_id_ts
AS SELECT
    TraceId,
    min(Timestamp) AS Start,
    max(Timestamp) AS End
FROM quasar_tracing.spans
WHERE TraceId != ''
GROUP BY TraceId;
