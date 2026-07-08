-- Platform Layer: log summary for faceted search / log rate aggregation

CREATE TABLE IF NOT EXISTS quasar_tracing.log_summary
(
    service_name    LowCardinality(String),
    severity_text   LowCardinality(String),
    time_bucket     DateTime,
    log_count       AggregateFunction(sum, UInt64),
    update_time     SimpleAggregateFunction(max, DateTime64(9))
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(time_bucket)
ORDER BY (service_name, severity_text, time_bucket)
TTL toDateTime(time_bucket) + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS quasar_tracing.log_summary_mv
TO quasar_tracing.log_summary
AS SELECT
    ServiceName                              AS service_name,
    SeverityText                             AS severity_text,
    toStartOfMinute(Timestamp)               AS time_bucket,
    sumState(toUInt64(1))                    AS log_count,
    max(Timestamp)                           AS update_time
FROM quasar_tracing.logs
GROUP BY service_name, severity_text, time_bucket;
