package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Trace list / header summary.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Trace list / header summary")
public class TraceSummaryDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Trace id (32 hex chars)", example = "aabbccddeeff00112233445566778899")
    private String traceId;

    @Schema(description = "Root span service name", example = "web-gateway")
    private String rootService;

    @Schema(description = "Root span / operation name", example = "GET /api/checkout")
    private String rootName;

    @Schema(description = "Trace start time, epoch milliseconds", example = "1717840800000")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long startTime;

    @Schema(description = "Total trace duration, nanoseconds", example = "120000000")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long durationNs;

    @Schema(description = "Number of spans in the trace", example = "18")
    private Integer spanCount;

    @Schema(description = "Number of error spans", example = "1")
    private Integer errorCount;

    @Schema(description = "Trace status", example = "Error", allowableValues = {"Ok", "Error"})
    private String status;

    @Schema(description = "Deployment environment", example = "production")
    private String environment;

    @Schema(description = "Host name", example = "ip-10-2-14-3")
    private String host;

    @Schema(description = "OTel service instance id", example = "9fd4c2e4-2d4b-4c4f-a77c-b1a5b07f3f6a")
    private String serviceInstanceId;

    @Schema(description = "Kubernetes namespace", example = "default")
    private String k8sNamespace;

    @Schema(description = "Kubernetes pod name", example = "order-service-7c9d6f9c5d-abc12")
    private String k8sPodName;

    @Schema(description = "Kubernetes pod uid")
    private String k8sPodUid;

    @Schema(description = "Kubernetes node name")
    private String k8sNodeName;

    @Schema(description = "Distinct services in the trace; populated in detail, null in search results")
    private List<String> services;

    @Schema(description = "Resolved trace source", allowableValues = {"live", "archive"})
    private TraceSource source;

    @Schema(description = "Archive creation time, epoch milliseconds; null for live traces")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long archivedAt;
}
