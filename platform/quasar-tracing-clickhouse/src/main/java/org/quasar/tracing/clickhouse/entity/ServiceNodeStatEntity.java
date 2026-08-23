package org.quasar.tracing.clickhouse.entity;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Query-layer topology node stats: stored service aggregates or a virtual infrastructure target
 * assembled from Client Span dependency edges.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Data
@NoArgsConstructor
public class ServiceNodeStatEntity {

    private String name;

    private String type;

    private Boolean virtual;

    private Long calls;

    private Double errorRate;

    private Double avgDurationNs;

    private String tech;

    private Double p50;

    private Double p90;

    private Double p99;
}
