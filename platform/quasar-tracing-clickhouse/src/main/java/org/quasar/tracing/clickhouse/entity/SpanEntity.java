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

    private String serviceName;

    private String spanName;

    private String spanKind;

    /** Span start time, epoch milliseconds (projected via {@code toUnixTimestamp64Milli}). */
    private Long timestamp;

    /** Span duration, nanoseconds (raw {@code Duration} UInt64 column). */
    private Long duration;

    private String statusCode;

    private String statusMessage;

    private Map<String, String> resourceAttributes;

    private Map<String, String> spanAttributes;

    /** Event names, parallel to {@link #eventTimestamps} / {@link #eventAttributes}. */
    private List<String> eventNames;

    /** Event times, epoch milliseconds (converted in SQL); parallel to {@link #eventNames}. */
    private List<Long> eventTimestamps;

    /** Per-event attribute maps; parallel to {@link #eventNames}. */
    private List<Map<String, String>> eventAttributes;

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
