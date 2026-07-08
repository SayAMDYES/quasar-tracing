package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A service node enriched for the /services list and overview health table.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Service node with latency percentiles and fan counts")
public class ServiceStatDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Service name")
    private String name;

    @Schema(description = "Topology type", allowableValues = {"app", "datastore", "mq", "external"})
    private String type;

    @Schema(description = "Technology label; may be null")
    private String tech;

    @Schema(description = "Total spans in the window")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long calls;

    @Schema(description = "Error ratio (0..1)")
    private Double errorRate;

    @Schema(description = "Average span duration, nanoseconds")
    private Double avgDurationNs;

    @Schema(description = "p50 latency, nanoseconds")
    private Double p50;

    @Schema(description = "p90 latency, nanoseconds")
    private Double p90;

    @Schema(description = "p99 latency, nanoseconds")
    private Double p99;

    @Schema(description = "Number of upstream callers")
    private Integer upstreams;

    @Schema(description = "Number of downstream dependencies")
    private Integer downstreams;
}
