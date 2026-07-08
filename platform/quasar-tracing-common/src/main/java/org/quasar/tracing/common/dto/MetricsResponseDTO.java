package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * /metrics payload for one service: bucket step (ms), the series, the per-endpoint
 * RED breakdown, and the headline summary.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Per-service RED metrics payload")
public class MetricsResponseDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Service name")
    private String service;

    @Schema(description = "Bucket step, milliseconds")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long step;

    @Schema(description = "Time series")
    private List<MetricPointDTO> series;

    @Schema(description = "Per-endpoint RED breakdown")
    private List<EndpointRedDTO> endpoints;

    @Schema(description = "Per-instance RED breakdown")
    private List<MetricInstanceDTO> instances;

    @Schema(description = "JVM runtime metrics")
    private JvmMetricsDTO jvm;

    @Schema(description = "Headline summary")
    private MetricsSummaryDTO summary;
}
