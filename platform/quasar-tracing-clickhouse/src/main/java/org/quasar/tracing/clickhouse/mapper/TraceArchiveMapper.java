package org.quasar.tracing.clickhouse.mapper;

import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.quasar.tracing.clickhouse.entity.SpanEntity;
import org.quasar.tracing.clickhouse.entity.TraceArchiveManifestEntity;
import org.quasar.tracing.clickhouse.entity.TraceSummaryEntity;

/**
 * Fixed SQL boundary for immutable Archive generations and their manifest log.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
public interface TraceArchiveMapper {

    TraceArchiveManifestEntity selectLatest(@Param("traceId") String traceId);

    String maxRevision(@Param("traceId") String traceId);

    int insertGeneration(@Param("traceId") String traceId, @Param("generation") String generation,
            @Param("archivedAt") Long archivedAt, @Param("expiresAt") Long expiresAt);

    List<SpanEntity> selectGeneration(@Param("traceId") String traceId,
            @Param("generation") String generation);

    int insertManifest(TraceArchiveManifestWrite manifest);

    int cleanupGeneration(@Param("traceId") String traceId, @Param("generation") String generation);

    List<TraceSummaryEntity> search(TraceSearchFilter filter);

    Long countSearch(TraceSearchFilter filter);
}
