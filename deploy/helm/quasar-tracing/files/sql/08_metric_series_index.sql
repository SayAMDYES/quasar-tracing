-- Platform Layer: metric series index for metric discovery and autocomplete
-- Tracks unique metric series across all metric sub-tables

CREATE TABLE IF NOT EXISTS quasar_tracing.metric_series_index
(
    metric_name      String,
    service_name     LowCardinality(String),
    attributes_hash  UInt64,
    first_seen       SimpleAggregateFunction(min, DateTime64(9)),
    last_seen        SimpleAggregateFunction(max, DateTime64(9)),
    sample_count     SimpleAggregateFunction(sum, UInt64)
) ENGINE = AggregatingMergeTree()
PARTITION BY tuple()
ORDER BY (service_name, metric_name, attributes_hash)
TTL toDateTime(last_seen) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- Index from gauge metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS quasar_tracing.metric_series_index_gauge_mv
TO quasar_tracing.metric_series_index
AS SELECT
    MetricName                                AS metric_name,
    ServiceName                               AS service_name,
    sipHash64(mapSort(Attributes))            AS attributes_hash,
    min(TimeUnix)                             AS first_seen,
    max(TimeUnix)                             AS last_seen,
    count()                                   AS sample_count
FROM quasar_tracing.otel_metrics_gauge
GROUP BY metric_name, service_name, attributes_hash;

-- Index from sum metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS quasar_tracing.metric_series_index_sum_mv
TO quasar_tracing.metric_series_index
AS SELECT
    MetricName                                AS metric_name,
    ServiceName                               AS service_name,
    sipHash64(mapSort(Attributes))            AS attributes_hash,
    min(TimeUnix)                             AS first_seen,
    max(TimeUnix)                             AS last_seen,
    count()                                   AS sample_count
FROM quasar_tracing.otel_metrics_sum
GROUP BY metric_name, service_name, attributes_hash;

-- Index from histogram metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS quasar_tracing.metric_series_index_histogram_mv
TO quasar_tracing.metric_series_index
AS SELECT
    MetricName                                AS metric_name,
    ServiceName                               AS service_name,
    sipHash64(mapSort(Attributes))            AS attributes_hash,
    min(TimeUnix)                             AS first_seen,
    max(TimeUnix)                             AS last_seen,
    count()                                   AS sample_count
FROM quasar_tracing.otel_metrics_histogram
GROUP BY metric_name, service_name, attributes_hash;

-- Index from exponential histogram metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS quasar_tracing.metric_series_index_exponential_histogram_mv
TO quasar_tracing.metric_series_index
AS SELECT
    MetricName                                AS metric_name,
    ServiceName                               AS service_name,
    sipHash64(mapSort(Attributes))            AS attributes_hash,
    min(TimeUnix)                             AS first_seen,
    max(TimeUnix)                             AS last_seen,
    count()                                   AS sample_count
FROM quasar_tracing.otel_metrics_exponential_histogram
GROUP BY metric_name, service_name, attributes_hash;

-- Index from summary metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS quasar_tracing.metric_series_index_summary_mv
TO quasar_tracing.metric_series_index
AS SELECT
    MetricName                                AS metric_name,
    ServiceName                               AS service_name,
    sipHash64(mapSort(Attributes))            AS attributes_hash,
    min(TimeUnix)                             AS first_seen,
    max(TimeUnix)                             AS last_seen,
    count()                                   AS sample_count
FROM quasar_tracing.otel_metrics_summary
GROUP BY metric_name, service_name, attributes_hash;
