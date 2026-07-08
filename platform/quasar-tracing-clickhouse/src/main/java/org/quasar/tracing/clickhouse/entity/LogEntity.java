package org.quasar.tracing.clickhouse.entity;

import java.util.Map;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One row of the ClickHouse {@code logs} detail table, shaped for querying. The stable
 * {@code id} the API exposes is derived per result position by the core service, not stored
 * here.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Data
@NoArgsConstructor
public class LogEntity {

    /** Log time, epoch milliseconds. */
    private Long timestamp;

    private String traceId;

    private String spanId;

    /** Severity text (e.g. {@code INFO}, {@code ERROR}). */
    private String severity;

    private String service;

    private String body;

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
