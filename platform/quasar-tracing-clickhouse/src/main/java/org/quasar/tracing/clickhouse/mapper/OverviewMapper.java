package org.quasar.tracing.clickhouse.mapper;

import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.quasar.tracing.clickhouse.entity.MetricSeriesSliceEntity;
import org.quasar.tracing.clickhouse.entity.TraceCountsEntity;

/**
 * Overview aggregates: the platform-wide RED series (summed across services) from
 * {@code service_endpoint_summary}, and distinct trace counts from {@code spans}. SQL lives in
 * {@code resources/mapper/OverviewMapper.xml}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
public interface OverviewMapper {

    /**
     * Platform-wide RED series (raw counts per bucket; percentiles in nanoseconds).
     *
     * @param from    window start, epoch milliseconds
     * @param to      window end, epoch milliseconds
     * @param stepSec bucket width in seconds
     * @return one row per bucket, ascending by time
     */
    List<MetricSeriesSliceEntity> platformSeries(@Param("from") Long from, @Param("to") Long to,
        @Param("stepSec") Integer stepSec);

    /**
     * @param from window start, epoch milliseconds
     * @param to   window end, epoch milliseconds
     * @return total and error trace counts over the window (always one row)
     */
    TraceCountsEntity traceCounts(@Param("from") Long from, @Param("to") Long to);
}
