package org.quasar.tracing.clickhouse.mapper;

import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.quasar.tracing.clickhouse.entity.EndpointRedEntity;
import org.quasar.tracing.clickhouse.entity.JvmMetricEntity;
import org.quasar.tracing.clickhouse.entity.MetricInstanceEntity;
import org.quasar.tracing.clickhouse.entity.MetricSeriesSliceEntity;

/**
 * RED metric reads over {@code service_endpoint_summary}: the per-endpoint breakdown over the
 * window and the bucketed time series for one service. SQL lives in
 * {@code resources/mapper/MetricMapper.xml}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
public interface MetricMapper {

    /**
     * Per-endpoint RED aggregates for a service over the window (percentiles in nanoseconds).
     *
     * @param service the service name
     * @param from    window start, epoch milliseconds
     * @param to      window end, epoch milliseconds
     * @return one row per server operation
     */
    List<EndpointRedEntity> endpointRed(@Param("service") String service,
        @Param("environment") String environment, @Param("namespace") String namespace,
        @Param("serviceInstanceId") String serviceInstanceId,
        @Param("from") Long from, @Param("to") Long to);

    /**
     * Per-instance RED aggregates for a service over the window.
     *
     * @param service the service name
     * @param from    window start, epoch milliseconds
     * @param to      window end, epoch milliseconds
     * @return one row per service instance
     */
    List<MetricInstanceEntity> instances(@Param("service") String service,
        @Param("environment") String environment, @Param("namespace") String namespace,
        @Param("serviceInstanceId") String serviceInstanceId,
        @Param("from") Long from, @Param("to") Long to);

    /**
     * JVM runtime metrics for Java services over the window.
     *
     * @param service the service name
     * @param from    window start, epoch milliseconds
     * @param to      window end, epoch milliseconds
     * @return one row per service instance
     */
    List<JvmMetricEntity> jvm(@Param("service") String service,
        @Param("environment") String environment, @Param("namespace") String namespace,
        @Param("serviceInstanceId") String serviceInstanceId,
        @Param("from") Long from, @Param("to") Long to);

    /**
     * RED time series for a service, bucketed to {@code stepSec} (raw counts per bucket;
     * percentiles in nanoseconds — the core service derives rps / error percent / ms).
     *
     * @param service the service name
     * @param from    window start, epoch milliseconds
     * @param to      window end, epoch milliseconds
     * @param stepSec bucket width in seconds
     * @return one row per bucket, ascending by time
     */
    List<MetricSeriesSliceEntity> series(@Param("service") String service,
        @Param("environment") String environment, @Param("namespace") String namespace,
        @Param("serviceInstanceId") String serviceInstanceId,
        @Param("from") Long from, @Param("to") Long to, @Param("stepSec") Integer stepSec);
}
