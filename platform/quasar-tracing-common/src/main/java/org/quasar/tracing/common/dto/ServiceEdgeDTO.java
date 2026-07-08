package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A directed service-dependency edge (caller → callee) aggregated over the window.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "A directed service-dependency edge")
public class ServiceEdgeDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Calling service", example = "web-gateway")
    private String caller;

    @Schema(description = "Called service", example = "order-service")
    private String callee;

    @Schema(description = "Number of calls")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long callCount;

    @Schema(description = "Number of failed calls")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long errorCount;

    @Schema(description = "Error ratio (0..1)")
    private Double errorRate;

    @Schema(description = "Average call duration, nanoseconds")
    private Double avgDurationNs;

    @Schema(description = "Operations observed on this edge")
    private List<String> operations;
}
