package org.quasar.tracing.clickhouse.mapper;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Normalized inputs for the log-search queries (search / count / histogram). Built by the
 * core service (window resolved, limit clamped, step chosen) and consumed by {@link LogMapper};
 * the XML reads its fields via getters, so this is a Lombok class rather than a record.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class LogSearchFilter {

    /** Match this service; null/blank = any. */
    private String service;

    /** Match this trace id; null/blank = any. */
    private String traceId;

    /** Match this span id; null/blank = any. */
    private String spanId;

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

    /** Match any of these severity texts; null/empty = any. */
    private List<String> severities;

    /** Free-text match on body or trace id; null/blank = no filter. */
    private String q;

    /** Window start, epoch milliseconds. */
    private Long from;

    /** Window end, epoch milliseconds. */
    private Long to;

    /** Cursor timestamp for forward stream reads, epoch milliseconds. */
    private Long cursor;

    private Integer limit;

    private Integer offset;

    /** Histogram bucket width in seconds (ignored by search/count). */
    private Integer stepSec;
}
