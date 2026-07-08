package org.quasar.tracing.clickhouse.entity;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Per-endpoint RED aggregates from {@code service_endpoint_summary} over a window: request
 * and error counts, and percentile latencies in nanoseconds. The core service derives the
 * error ratio, RPS, and millisecond percentiles for the API.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Data
@NoArgsConstructor
public class EndpointRedEntity {

    private String operation;

    private Long requestCount;

    private Long errorCount;

    private Double p50;

    private Double p90;

    private Double p99;
}
