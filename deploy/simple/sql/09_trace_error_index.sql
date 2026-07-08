-- Platform Layer: error trace index for error tracking dashboard
-- Lightweight index of error spans for fast error queries

CREATE TABLE IF NOT EXISTS quasar_tracing.trace_error_index
(
    trace_id       String,
    span_id        String,
    service_name   LowCardinality(String),
    span_name      LowCardinality(String),
    timestamp      DateTime64(9),
    status_message String CODEC(ZSTD(1)),
    duration_ns    UInt64
) ENGINE = MergeTree
PARTITION BY toDate(timestamp)
ORDER BY (service_name, timestamp, trace_id)
TTL toDateTime(timestamp) + toIntervalDay(7)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS quasar_tracing.trace_error_index_mv
TO quasar_tracing.trace_error_index
AS SELECT
    TraceId       AS trace_id,
    SpanId        AS span_id,
    ServiceName   AS service_name,
    SpanName      AS span_name,
    Timestamp     AS timestamp,
    StatusMessage AS status_message,
    Duration      AS duration_ns
FROM quasar_tracing.spans
WHERE StatusCode = 'Error';
