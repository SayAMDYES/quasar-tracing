package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Service detail: node stats (nanosecond percentiles), per-endpoint RED (milliseconds),
 * and the upstream/downstream edges.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Service detail panel payload")
public class ServiceDetailDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Service name")
    private String name;

    @Schema(description = "Topology type", allowableValues = {"app", "datastore", "mq", "external"})
    private String type;

    @Schema(description = "Technology label; may be null")
    private String tech;

    @Schema(description = "Whether this node was derived from Client Span target semantics")
    private Boolean virtual;

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

    @Schema(description = "Per-endpoint RED breakdown (percentiles in milliseconds)")
    private List<EndpointRedDTO> endpoints;

    @Schema(description = "Inbound edges (callers)")
    private List<ServiceEdgeDTO> upstreams;

    @Schema(description = "Outbound edges (dependencies)")
    private List<ServiceEdgeDTO> downstreams;
}
