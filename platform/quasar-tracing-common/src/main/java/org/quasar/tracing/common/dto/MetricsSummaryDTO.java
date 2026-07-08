package org.quasar.tracing.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Headline metrics for a service.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Headline metrics for a service")
public class MetricsSummaryDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Average requests per second")
    private Double rps;

    @Schema(description = "Error ratio (0..1)")
    private Double errorRate;

    @Schema(description = "p50 latency, milliseconds")
    private Double p50;

    @Schema(description = "p90 latency, milliseconds")
    private Double p90;

    @Schema(description = "p99 latency, milliseconds")
    private Double p99;

    @Schema(description = "Latest series point")
    private MetricPointDTO current;
}
