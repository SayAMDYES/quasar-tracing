package org.quasar.tracing.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * JVM runtime metrics for Java services.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/05
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "JVM runtime metrics")
public class JvmMetricsDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Heap used, bytes")
    private Double heapUsed;

    @Schema(description = "Heap limit, bytes")
    private Double heapLimit;

    @Schema(description = "CPU utilization ratio")
    private Double cpuUtilization;

    @Schema(description = "Live thread count")
    private Double threadCount;

    @Schema(description = "Average GC duration, milliseconds")
    private Double gcDuration;
}
