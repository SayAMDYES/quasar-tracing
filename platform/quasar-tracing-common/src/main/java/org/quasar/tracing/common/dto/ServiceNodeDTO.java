package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A service-map node.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "A service-map node")
public class ServiceNodeDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Service name", example = "order-service")
    private String name;

    @Schema(description = "Topology type", example = "app", allowableValues = {"app", "datastore", "mq", "external"})
    private String type;

    @Schema(description = "Technology label; not currently rendered, may be null")
    private String tech;

    @Schema(description = "Total spans observed for the service in the window")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long calls;

    @Schema(description = "Error ratio (0..1)")
    private Double errorRate;

    @Schema(description = "Average span duration, nanoseconds")
    private Double avgDurationNs;
}
