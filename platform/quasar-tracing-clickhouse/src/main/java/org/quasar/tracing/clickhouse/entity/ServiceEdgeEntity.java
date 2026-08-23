package org.quasar.tracing.clickhouse.entity;

import java.util.List;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A directed caller→callee dependency aggregated from service-to-service relationships or
 * Client Span infrastructure semantics over a window.
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

    private String calleeType;

    private String calleeTech;

    private Long callCount;

    private Long errorCount;

    private Double errorRate;

    private Double avgDurationNs;

    private List<String> operations;
}
