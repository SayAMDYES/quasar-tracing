package org.quasar.tracing.clickhouse.mapper;

import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.quasar.tracing.clickhouse.entity.ServiceEdgeEntity;
import org.quasar.tracing.clickhouse.entity.ServiceNodeStatEntity;

/**
 * Service-map reads: per-service node stats from {@code span_service_index} and directed
 * dependency edges from the {@code service_dependency} view. SQL lives in
 * {@code resources/mapper/ServiceMapper.xml}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
public interface ServiceMapper {

    /**
     * @param from window start, epoch milliseconds
     * @param to   window end, epoch milliseconds
     * @return per-service stats over the window
     */
    List<ServiceNodeStatEntity> selectNodeStats(@Param("from") Long from, @Param("to") Long to);

    /**
     * @param from window start, epoch milliseconds
     * @param to   window end, epoch milliseconds
     * @return directed dependency edges aggregated over the window
     */
    List<ServiceEdgeEntity> selectEdges(@Param("from") Long from, @Param("to") Long to);
}
