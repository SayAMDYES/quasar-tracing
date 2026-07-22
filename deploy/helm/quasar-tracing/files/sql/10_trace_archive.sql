-- Optional immutable Trace Archive schema. Enable the application only after this migration is installed.
CREATE TABLE IF NOT EXISTS quasar_tracing.trace_archive_manifest
(
    TraceId         String,
    Generation      UUID,
    Revision        UInt64,
    RevisionId      UUID,
    State           Enum8('ACTIVE' = 1, 'DELETED' = 2),
    ArchivedAt      DateTime64(3),
    ExpiresAt       DateTime64(3),
    SourceStartTime DateTime64(9),
    SourceEndTime   DateTime64(9),
    RootServiceName LowCardinality(String),
    RootSpanName    LowCardinality(String),
    DurationNano    UInt64,
    SpanCount       UInt32,
    ErrorCount      UInt32,
    Status          LowCardinality(String),
    Services        Array(String),
    ChecksumSha256  FixedString(64),
    UpdatedAt       DateTime64(9),
    INDEX idx_archive_service RootServiceName TYPE set(1000) GRANULARITY 4,
    INDEX idx_archive_start SourceStartTime TYPE minmax GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ArchivedAt)
ORDER BY TraceId
TTL ExpiresAt DELETE;

CREATE TABLE IF NOT EXISTS quasar_tracing.trace_archive_spans
(
    ArchiveGeneration    UUID,
    ArchivedAt            DateTime64(3),
    ExpiresAt              DateTime64(3),
    Timestamp             DateTime64(9) CODEC(Delta(8), ZSTD(1)),
    TraceId               String CODEC(ZSTD(1)),
    SpanId                String CODEC(ZSTD(1)),
    ParentSpanId          String CODEC(ZSTD(1)),
    TraceState             String CODEC(ZSTD(1)),
    SpanName              LowCardinality(String) CODEC(ZSTD(1)),
    SpanKind              LowCardinality(String) CODEC(ZSTD(1)),
    ServiceName            LowCardinality(String) CODEC(ZSTD(1)),
    ResourceAttributes    Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    ScopeName              String CODEC(ZSTD(1)),
    ScopeVersion           String CODEC(ZSTD(1)),
    SpanAttributes        Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    Duration               UInt64 CODEC(ZSTD(1)),
    StatusCode             LowCardinality(String) CODEC(ZSTD(1)),
    StatusMessage          String CODEC(ZSTD(1)),
    `Events.Timestamp`     Array(DateTime64(9)) CODEC(ZSTD(1)),
    `Events.Name`          Array(LowCardinality(String)) CODEC(ZSTD(1)),
    `Events.Attributes`    Array(Map(LowCardinality(String), String)) CODEC(ZSTD(1)),
    `Links.TraceId`        Array(String) CODEC(ZSTD(1)),
    `Links.SpanId`         Array(String) CODEC(ZSTD(1)),
    `Links.TraceState`     Array(String) CODEC(ZSTD(1)),
    `Links.Attributes`     Array(Map(LowCardinality(String), String)) CODEC(ZSTD(1)),
    INDEX idx_archive_trace_id TraceId TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_archive_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_archive_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_archive_span_attr_key mapKeys(SpanAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_archive_span_attr_value mapValues(SpanAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_archive_duration Duration TYPE minmax GRANULARITY 1,
    INDEX idx_archive_source_time Timestamp TYPE minmax GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ArchivedAt)
ORDER BY (TraceId, ArchiveGeneration, SpanId)
TTL ExpiresAt DELETE;
