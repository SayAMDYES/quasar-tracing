-- Platform Layer: service dependency map
-- A span index is populated incrementally; the dependency view joins the current index
-- so parent/child spans can arrive in different batches without permanently losing edges.

CREATE TABLE IF NOT EXISTS quasar_tracing.span_service_index
(
    trace_id       String,
    span_id        String,
    parent_span_id String,
    service_name   LowCardinality(String),
    span_name      LowCardinality(String),
    span_kind      LowCardinality(String),
    timestamp      DateTime64(9),
    duration_ns    UInt64,
    is_error       UInt8
) ENGINE = MergeTree
PARTITION BY toDate(timestamp)
ORDER BY (trace_id, span_id, timestamp)
TTL toDateTime(timestamp) + toIntervalDay(3)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS quasar_tracing.span_service_index_mv
TO quasar_tracing.span_service_index
AS SELECT
    TraceId                                         AS trace_id,
    SpanId                                          AS span_id,
    ParentSpanId                                    AS parent_span_id,
    ServiceName                                     AS service_name,
    SpanName                                        AS span_name,
    SpanKind                                        AS span_kind,
    Timestamp                                       AS timestamp,
    Duration                                        AS duration_ns,
    toUInt8(if(StatusCode = 'Error', 1, 0))         AS is_error
FROM quasar_tracing.spans
WHERE TraceId != ''
  AND SpanId != '';

CREATE VIEW IF NOT EXISTS quasar_tracing.service_dependency
AS SELECT
    parent.service_name                  AS caller_service,
    child.service_name                   AS callee_service,
    child.span_name                      AS span_name,
    toStartOfMinute(child.timestamp)     AS time_bucket,
    count()                              AS call_count,
    sum(toUInt64(child.is_error))        AS error_count,
    avg(child.duration_ns)               AS duration_avg,
    max(child.timestamp)                 AS update_time
FROM quasar_tracing.span_service_index AS child
INNER JOIN quasar_tracing.span_service_index AS parent
    ON child.parent_span_id = parent.span_id
   AND child.trace_id = parent.trace_id
   AND parent.service_name != child.service_name
WHERE child.span_kind IN ('Client', 'Server')
GROUP BY caller_service, callee_service, span_name, time_bucket;
