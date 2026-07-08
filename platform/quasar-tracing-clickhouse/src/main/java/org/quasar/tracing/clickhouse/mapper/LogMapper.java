package org.quasar.tracing.clickhouse.mapper;

import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.quasar.tracing.clickhouse.entity.LogEntity;
import org.quasar.tracing.clickhouse.entity.LogHistogramSliceEntity;

/**
 * Log reads over the {@code logs} detail table: trace correlation, filtered search,
 * matching count, and the bucketed severity histogram. SQL lives in
 * {@code resources/mapper/LogMapper.xml}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
public interface LogMapper {

    /**
     * Loads the logs correlated to a trace, ordered by time.
     *
     * @param traceId the trace id
     * @return the trace's logs, ascending by timestamp; empty when none
     */
    List<LogEntity> selectByTraceId(@Param("traceId") String traceId);

    /**
     * @param filter normalized search inputs
     * @return one page of matching logs, newest first
     */
    List<LogEntity> search(LogSearchFilter filter);

    /**
     * @param filter the same filter passed to {@link #search}
     * @return total matching logs (ignoring limit/offset)
     */
    Long countSearch(LogSearchFilter filter);

    /**
     * @param filter the same filter passed to {@link #search}, with {@code stepSec} set
     * @return per-bucket, per-severity counts, ascending by bucket time
     */
    List<LogHistogramSliceEntity> histogram(LogSearchFilter filter);

    /**
     * The most recent {@code ERROR}/{@code FATAL} logs in the window (newest first).
     *
     * @param from  window start, epoch milliseconds
     * @param to    window end, epoch milliseconds
     * @param limit max rows
     * @return the recent error logs
     */
    List<LogEntity> recentErrors(@Param("from") Long from, @Param("to") Long to, @Param("limit") Integer limit);
}
