package org.quasar.tracing.clickhouse.entity;

import java.util.Map;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One aggregated trace row produced by the trace-search query: spans of a trace
 * collapsed (grouped by {@code TraceId}) into a list-view summary.
 *
 * <p>Row-shaped; the core service maps it to {@code TraceSummaryDTO} (the list view
 * leaves the DTO's {@code services} null).
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Data
@NoArgsConstructor
public class TraceSummaryEntity {

    private String traceId;

    private String rootService;

    private String rootName;

    /** Trace start time, epoch milliseconds. */
    private Long startTime;

    /** Total trace duration, nanoseconds. */
    private Long durationNs;

    private Integer spanCount;

    private Integer errorCount;

    private String status;

    /** Root-span resource attributes ({@code any(ResourceAttributes)} over the group). */
    private Map<String, String> resourceAttributes;

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
