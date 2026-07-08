package org.quasar.tracing.clickhouse.entity;

import java.util.List;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A directed caller→callee dependency aggregated from the {@code service_dependency} view
 * over a window: call/error counts, average duration (ns), and the operations seen on the edge.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Data
@NoArgsConstructor
public class ServiceEdgeEntity {

    private String caller;

    private String callee;

    private Long callCount;

    private Long errorCount;

    private Double errorRate;

    private Double avgDurationNs;

    private List<String> operations;
}
