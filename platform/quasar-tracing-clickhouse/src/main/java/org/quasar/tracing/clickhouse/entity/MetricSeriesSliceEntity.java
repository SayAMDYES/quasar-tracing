package org.quasar.tracing.clickhouse.entity;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One bucket of the RED time series from {@code service_endpoint_summary}: raw request/error
 * counts in the bucket and percentile latencies in nanoseconds. The core service derives rps,
 * error percent, and millisecond percentiles.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Data
@NoArgsConstructor
public class MetricSeriesSliceEntity {

    /** Bucket start time, epoch milliseconds. */
    private Long time;

    /** Total requests in the bucket. */
    private Double requests;

    /** Total errors in the bucket. */
    private Double errors;

    private Double p50;

    private Double p90;

    private Double p99;
}
