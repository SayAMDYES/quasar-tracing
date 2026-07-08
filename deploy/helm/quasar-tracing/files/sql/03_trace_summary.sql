-- Platform Layer: trace summary table
-- Queried by the Platform Layer for trace list / search

CREATE TABLE IF NOT EXISTS quasar_tracing.trace_summary
(
    trace_id          String,
    root_service_name LowCardinality(String),
    root_span_name    LowCardinality(String),
    start_time        DateTime64(9),
    duration_ns       UInt64,
    span_count        UInt32,
    error_count       UInt32,
    status            LowCardinality(String),
    update_time       DateTime64(9)
) ENGINE = ReplacingMergeTree(update_time)
PARTITION BY toDate(start_time)
ORDER BY (root_service_name, trace_id)
TTL toDateTime(start_time) + INTERVAL 30 DAY;
