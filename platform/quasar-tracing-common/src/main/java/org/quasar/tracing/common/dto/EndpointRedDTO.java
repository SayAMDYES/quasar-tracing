package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Per-endpoint RED metrics.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Per-endpoint RED metrics")
public class EndpointRedDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Operation / endpoint name", example = "POST /orders")
    private String operation;

    @Schema(description = "Total requests in the window")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long requestCount;

    @Schema(description = "Requests per second")
    private Double rps;

    @Schema(description = "Error ratio (0..1)")
    private Double errorRate;

    @Schema(description = "p50 latency, milliseconds")
    private Double p50;

    @Schema(description = "p90 latency, milliseconds")
    private Double p90;

    @Schema(description = "p99 latency, milliseconds")
    private Double p99;
}
