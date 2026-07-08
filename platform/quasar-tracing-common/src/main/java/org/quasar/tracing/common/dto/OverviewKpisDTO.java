package org.quasar.tracing.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Overview headline KPIs.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Overview headline KPIs")
public class OverviewKpisDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Average requests per second")
    private Double rps;

    @Schema(description = "Error ratio (0..1)")
    private Double errorRate;

    @Schema(description = "Average p99 latency, milliseconds")
    private Double p99;

    @Schema(description = "Trace count in the window")
    private Integer traceCount;

    @Schema(description = "Error-trace count in the window")
    private Integer errorTraceCount;

    @Schema(description = "Total app services")
    private Integer serviceCount;

    @Schema(description = "App services in unhealthy state")
    private Integer unhealthyCount;

    @Schema(description = "App services in degraded state")
    private Integer degradedCount;
}
