package org.quasar.tracing.clickhouse.mapper;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Bound values for one append-only Archive manifest fact row.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TraceArchiveManifestWrite {

    private String traceId;
    private String generation;
    private String revision;
    private String revisionId;
    private String state;
    private Long archivedAt;
    private Long expiresAt;
    private String sourceStartTimeUnixNano;
    private String sourceEndTimeUnixNano;
    private String rootServiceName;
    private String rootSpanName;
    private String durationNano;
    private Integer spanCount;
    private Integer errorCount;
    private String status;
    private List<String> services;
    private String checksumSha256;
}
