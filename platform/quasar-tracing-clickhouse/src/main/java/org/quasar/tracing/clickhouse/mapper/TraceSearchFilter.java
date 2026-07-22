package org.quasar.tracing.clickhouse.mapper;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.quasar.tracing.common.dto.TraceAttributeConditionDTO;
import org.quasar.tracing.common.dto.TraceSpanSelectorDTO;

/**
 * Normalized inputs for the trace-search query. Built by the core service (window
 * resolved, limit clamped, durations converted to nanoseconds) and consumed by
 * {@link TraceMapper}; the XML reads its fields via getters, so this is a Lombok
 * class rather than a record (MyBatis property access needs {@code getX()}).
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TraceSearchFilter {

    /** Match traces containing this service; null/blank = any. */
    private String service;

    /** Match this root operation name; null/blank = any. */
    private String operation;

    /** {@code "all"} (default), {@code "error"}, or {@code "ok"}. */
    private String status;

    /** Match this deployment environment; null/blank = any. */
    private String environment;

    /** Match this generic namespace; null/blank = any. */
    private String namespace;

    /** Match this Kubernetes namespace; null/blank = any. */
    private String k8sNamespace;

    /** Match this Kubernetes pod name; null/blank = any. */
    private String k8sPodName;

    /** Match this Kubernetes node name; null/blank = any. */
    private String k8sNodeName;

    /** Match this OTel service instance id; null/blank = any. */
    private String serviceInstanceId;

    /** Minimum total duration in nanoseconds; null/&le;0 = no lower bound. */
    private Long minDurationNs;

    /** Maximum total duration in nanoseconds; null/&le;0 = no upper bound. */
    private Long maxDurationNs;

    /** Window start, epoch milliseconds. */
    private Long from;

    /** Window end, epoch milliseconds. */
    private Long to;

    /** Free-text match on root operation name or trace id; null/blank = no filter. */
    private String q;

    /** Raw sort key: {@code "startTime"} (default), {@code "duration"}, or {@code "spans"}. */
    private String sort;

    /** Raw sort direction: {@code "asc"} or {@code "desc"} (default). */
    private String order;

    private Integer limit;

    private Integer offset;

    /** Conditions that must all match the same span row; empty = no attribute filter. */
    private List<TraceAttributeConditionDTO> attributeConditions;

    /** Fields that must match one span row; null = no same-span filter. */
    private TraceSpanSelectorDTO spanSelector;

    /** Fixed source branch selected by the core service: {@code live} or {@code archive}. */
    private String source;
}
