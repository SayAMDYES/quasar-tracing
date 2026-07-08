package org.quasar.tracing.clickhouse.entity;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Per-service stats aggregated from {@code span_service_index} over a window: call volume,
 * error ratio, average and percentile latencies (all nanoseconds).
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Data
@NoArgsConstructor
public class ServiceNodeStatEntity {

    private String name;

    private Long calls;

    private Double errorRate;

    private Double avgDurationNs;

    private String tech;

    private Double p50;

    private Double p90;

    private Double p99;
}
