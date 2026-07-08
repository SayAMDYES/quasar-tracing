package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.util.List;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One span within a trace.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "One span within a trace")
public class SpanDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Trace id")
    private String traceId;

    @Schema(description = "Span id")
    private String spanId;

    @Schema(description = "Parent span id; empty for the root span")
    private String parentSpanId;

    @Schema(description = "Service that emitted the span", example = "order-service")
    private String service;

    @Schema(description = "Span / operation name", example = "POST /orders")
    private String name;

    @Schema(description = "OpenTelemetry span kind", example = "Server")
    private String kind;

    @Schema(description = "Start offset from the trace root, milliseconds")
    private Double offsetMs;

    @Schema(description = "Span start time, epoch milliseconds")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long timestamp;

    @Schema(description = "Span duration, nanoseconds")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long durationNs;

    @Schema(description = "Span duration, milliseconds")
    private Double durationMs;

    @Schema(description = "OpenTelemetry status code", example = "Ok", allowableValues = {"Ok", "Error", "Unset"})
    private String statusCode;

    @Schema(description = "Status message (error detail)")
    private String statusMessage;

    @Schema(description = "Depth from the root span (0 = root)")
    private Integer depth;

    @Schema(description = "OTel resource attributes")
    private Map<String, String> resourceAttributes;

    @Schema(description = "OTel span attributes")
    private Map<String, String> spanAttributes;

    @Schema(description = "Span events (e.g. exceptions)")
    private List<SpanEventDTO> events;
}
