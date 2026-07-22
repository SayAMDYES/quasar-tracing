package org.quasar.tracing.clickhouse.entity;

import java.util.List;
import java.util.Map;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One row of the ClickHouse {@code spans} detail table, shaped for querying.
 *
 * <p>Field values stay close to the raw columns (e.g. {@code duration} is the
 * UInt64 nanosecond value and {@code timestamp} is the row time projected to epoch
 * milliseconds by the mapper). The conversion to the API-facing {@code SpanDTO}
 * (offsets, ms durations, depth, status normalization, events) happens in the core
 * service layer, not here.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Data
@NoArgsConstructor
public class SpanEntity {

    private String traceId;

    private String spanId;

    private String parentSpanId;

    private String traceState;

    private String serviceName;

    private String spanName;

    private String spanKind;

    /** Span start time, epoch milliseconds (projected via {@code toUnixTimestamp64Milli}). */
    private Long timestamp;

    /** Span duration, nanoseconds (raw {@code Duration} UInt64 column). */
    private Long duration;

    /** Span start time, epoch nanoseconds represented as an unsigned decimal string. */
    private String startTimeUnixNano;

    /** Span duration, nanoseconds represented as an unsigned decimal string. */
    private String durationNano;

    private String statusCode;

    private String statusMessage;

    private Map<String, String> resourceAttributes;

    private String scopeName;

    private String scopeVersion;

    private Map<String, String> spanAttributes;

    /** Event names, parallel to {@link #eventTimestamps} / {@link #eventAttributes}. */
    private List<String> eventNames;

    /** Event times, epoch milliseconds (converted in SQL); parallel to {@link #eventNames}. */
    private List<Long> eventTimestamps;

    /** Event times, epoch nanoseconds as decimal strings; parallel to {@link #eventNames}. */
    private List<String> eventTimeUnixNanos;

    /** Per-event attribute maps; parallel to {@link #eventNames}. */
    private List<Map<String, String>> eventAttributes;

    /** Linked trace ids; parallel to the other link arrays. */
    private List<String> linkTraceIds;

    /** Linked span ids; parallel to the other link arrays. */
    private List<String> linkSpanIds;

    /** Linked trace states; parallel to the other link arrays. */
    private List<String> linkTraceStates;

    /** Per-link attribute maps; parallel to the other link arrays. */
    private List<Map<String, String>> linkAttributes;

    /**
     * Verifies that the stored arrays used to build a trace document remain aligned.
     * Null arrays are treated as empty.
     */
    public void validateDocumentArrays() {
        int eventCount = sizeOf(eventNames);
        if (sizeOf(eventTimeUnixNanos) != eventCount || sizeOf(eventAttributes) != eventCount) {
            throw new IllegalStateException(
                    "INVALID_STORED_SPAN_ARRAYS: event arrays have inconsistent lengths");
        }

        int linkCount = sizeOf(linkTraceIds);
        if (sizeOf(linkSpanIds) != linkCount
                || sizeOf(linkTraceStates) != linkCount
                || sizeOf(linkAttributes) != linkCount) {
            throw new IllegalStateException(
                    "INVALID_STORED_SPAN_ARRAYS: link arrays have inconsistent lengths");
        }
    }

    private static int sizeOf(List<?> values) {
        return values == null ? 0 : values.size();
    }

    /**
     * Deployment environment, derived from {@code resourceAttributes}. Derived here (not
     * projected in SQL) because the JDBC driver's statement parser breaks on multiple
     * dotted map-key literals per statement.
     */
    public String getEnvironment() {
        return attr("deployment.environment.name");
    }

    /** Host name, derived from {@code resourceAttributes}. */
    public String getHost() {
        return attr("host.name");
    }

    public String getServiceInstanceId() {
        return attr("service.instance.id");
    }

    public String getK8sNamespace() {
        return attr("k8s.namespace.name");
    }

    public String getK8sPodName() {
        return attr("k8s.pod.name");
    }

    public String getK8sPodUid() {
        return attr("k8s.pod.uid");
    }

    public String getK8sNodeName() {
        return attr("k8s.node.name");
    }

    private String attr(String key) {
        return resourceAttributes == null ? "" : resourceAttributes.getOrDefault(key, "");
    }
}
