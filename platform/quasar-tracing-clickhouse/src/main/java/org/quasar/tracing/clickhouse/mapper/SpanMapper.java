package org.quasar.tracing.clickhouse.mapper;

import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.quasar.tracing.clickhouse.entity.SpanEntity;

/**
 * MyBatis mapper for the ClickHouse {@code spans} detail table.
 *
 * <p>SQL lives in {@code resources/mapper/SpanMapper.xml}; the mapper scan is
 * registered by {@code MyBatisConfig}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
public interface SpanMapper {

    /**
     * Loads every span of a trace, ordered by start time.
     *
     * @param traceId the trace id
     * @return the trace's spans, or an empty list when the trace is unknown
     */
    List<SpanEntity> selectByTraceId(@Param("traceId") String traceId);
}
