package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Per-instance RED metrics and resource attributes for one service.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/05
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Per-instance RED metrics and resource attributes")
public class MetricInstanceDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "OTel service.instance.id")
    private String serviceInstanceId;

    @Schema(description = "Runtime type derived from resource attributes")
    private String runtimeType;

    @Schema(description = "Display name for the instance")
    private String displayName;

    @Schema(description = "Total requests in the window")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long requestCount;

    @Schema(description = "Requests per second")
    private Double rps;

    @Schema(description = "Error ratio (0..1)")
    private Double errorRate;

    @Schema(description = "p99 latency, milliseconds")
    private Double p99;

    @Schema(description = "Representative resource attributes for this instance")
    private Map<String, String> resourceAttributes;
}
