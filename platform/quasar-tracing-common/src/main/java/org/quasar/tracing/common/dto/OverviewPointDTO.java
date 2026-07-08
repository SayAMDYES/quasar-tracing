package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One point on the platform-wide overview series.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "An overview time-series point")
public class OverviewPointDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Bucket time, epoch milliseconds")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long time;

    @Schema(description = "Requests per second")
    private Double requests;

    @Schema(description = "Errors per second")
    private Double errors;

    @Schema(description = "Error rate as a percent (0..100)")
    private Double errorRate;

    @Schema(description = "p99 latency, milliseconds")
    private Double p99;
}
