-- Platform Layer: service endpoint summary (RED metrics per service + endpoint)
-- Uses AggregatingMergeTree for correct incremental aggregation

CREATE TABLE IF NOT EXISTS quasar_tracing.service_endpoint_summary
(
    service_name       LowCardinality(String),
    span_name          LowCardinality(String),
    span_kind          LowCardinality(String),
    time_bucket        DateTime,
    request_count      AggregateFunction(sum, UInt64),
    error_count        AggregateFunction(sum, UInt64),
    duration_quantiles AggregateFunction(quantiles(0.5, 0.9, 0.99), UInt64),
    update_time        SimpleAggregateFunction(max, DateTime64(9))
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(time_bucket)
ORDER BY (service_name, span_name, span_kind, time_bucket)
TTL toDateTime(time_bucket) + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS quasar_tracing.service_endpoint_summary_mv
TO quasar_tracing.service_endpoint_summary
AS SELECT
    ServiceName                                          AS service_name,
    SpanName                                             AS span_name,
    SpanKind                                             AS span_kind,
    toStartOfMinute(Timestamp)                           AS time_bucket,
    sumState(toUInt64(1))                                AS request_count,
    sumState(toUInt64(if(StatusCode = 'Error', 1, 0))) AS error_count,
    quantilesState(0.5, 0.9, 0.99)(Duration)             AS duration_quantiles,
    max(Timestamp)                                       AS update_time
FROM quasar_tracing.spans
WHERE SpanKind IN ('Server', 'Client')
GROUP BY service_name, span_name, span_kind, time_bucket;
