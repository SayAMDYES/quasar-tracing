package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A single log record.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "A single log record")
public class LogRecordDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Stable record id")
    private String id;

    @Schema(description = "Log time, epoch milliseconds")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long timestamp;

    @Schema(description = "Correlated trace id; empty when not correlated")
    private String traceId;

    @Schema(description = "Correlated span id; empty when not correlated")
    private String spanId;

    @Schema(description = "Service name", example = "payment-service")
    private String service;

    @Schema(description = "Severity text", example = "ERROR")
    private String severity;

    @Schema(description = "Log body / message")
    private String body;

    @Schema(description = "Deployment environment", example = "production")
    private String environment;

    @Schema(description = "Host name")
    private String host;

    @Schema(description = "OTel service instance id")
    private String serviceInstanceId;

    @Schema(description = "Kubernetes namespace")
    private String k8sNamespace;

    @Schema(description = "Kubernetes pod name")
    private String k8sPodName;

    @Schema(description = "Kubernetes pod uid")
    private String k8sPodUid;

    @Schema(description = "Kubernetes node name")
    private String k8sNodeName;

    @Schema(description = "OTel resource attributes")
    private Map<String, String> resourceAttributes;
}
