package org.quasar.tracing.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.quasar.tracing.clickhouse.entity.EndpointRedEntity;
import org.quasar.tracing.clickhouse.entity.JvmMetricEntity;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.quasar.tracing.clickhouse.entity.MetricInstanceEntity;
import org.quasar.tracing.clickhouse.entity.MetricSeriesSliceEntity;
import org.quasar.tracing.clickhouse.mapper.MetricMapper;
import org.quasar.tracing.common.dto.MetricPointDTO;
import org.quasar.tracing.common.dto.MetricsResponseDTO;
import org.mockito.ArgumentMatchers;

/**
 * Unit tests for {@link MetricsService}: series conversions (rps, error percent, ns→ms) and the
 * ratio summary.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
class MetricsServiceTest {

    private final MetricMapper metricMapper = Mockito.mock(MetricMapper.class);
    private final MetricsService service = new MetricsService(metricMapper, new EndpointRedAssembler());

    @Test
    void convertsSeriesAndDerivesRatioSummary() {
        when(metricMapper.series(any(), any(), any(), any(), any(), any(), any())).thenReturn(List.of(
            slice(0L, 120.0, 12.0, 1_000_000.0, 5_000_000.0, 9_000_000.0),
            slice(60_000L, 60.0, 0.0, 2_000_000.0, 4_000_000.0, 8_000_000.0)));
        when(metricMapper.endpointRed(any(), any(), any(), any(), any(), any())).thenReturn(List.of(
            endpoint("GET /*", 240L), endpoint("HTTP /*", 220L), endpoint("POST /", 200L),
            endpoint("OPTIONS /api/v1/users/me", 190L), endpoint("POST /api", 185L),
            endpoint("GET /api/*", 180L), endpoint("GET /files/{*key}", 160L),
            endpoint("GET /orders", 120L)));
        when(metricMapper.instances(any(), any(), any(), any(), any(), any())).thenReturn(List.of(
            instance("pod-a", 120L, 12L, 9_000_000.0, Map.of("k8s.pod.name", "pod-a"))));
        when(metricMapper.jvm(any(), any(), any(), any(), any(), any())).thenReturn(List.of(jvm(128.0, 512.0, 0.25, 48.0, 12.0)));

        // 2-minute window → stepSec = 60, stepMs = 60000
        MetricsResponseDTO metrics = service.metrics("web-gateway", "production", "quasar", "pod-a", 0L, 120_000L);

        assertThat(metrics.getService()).isEqualTo("web-gateway");
        assertThat(metrics.getStep()).isEqualTo(60_000L);
        assertThat(metrics.getSeries()).hasSize(2);

        MetricPointDTO first = metrics.getSeries().get(0);
        assertThat(first.getRequests()).isEqualTo(2.0);   // 120 / 60s
        assertThat(first.getErrorRate()).isEqualTo(10.0);  // 12/120 * 100 (percent)
        assertThat(first.getP99()).isEqualTo(9.0);         // 9_000_000 ns → ms

        assertThat(metrics.getSummary().getRps()).isEqualTo(1.5);         // avg(2.0, 1.0)
        assertThat(metrics.getSummary().getErrorRate()).isEqualTo(0.05);  // avg(10, 0) / 100 (ratio)
        assertThat(metrics.getSummary().getCurrent().getTime()).isEqualTo(60_000L);
        assertThat(metrics.getEndpoints()).extracting("operation").containsExactly("GET /orders");
        assertThat(metrics.getInstances()).hasSize(1);
        assertThat(metrics.getInstances().get(0).getServiceInstanceId()).isEqualTo("pod-a");
        assertThat(metrics.getInstances().get(0).getRuntimeType()).isEqualTo("pod");
        assertThat(metrics.getInstances().get(0).getRps()).isEqualTo(1.0);
        assertThat(metrics.getJvm().getHeapUsed()).isEqualTo(128.0);
        assertThat(metrics.getJvm().getHeapLimit()).isEqualTo(512.0);
        assertThat(metrics.getJvm().getCpuUtilization()).isEqualTo(0.25);
        assertThat(metrics.getJvm().getThreadCount()).isEqualTo(48.0);
        assertThat(metrics.getJvm().getGcDuration()).isEqualTo(12.0);
        verify(metricMapper).series("web-gateway", "production", "quasar", "pod-a", 0L, 120_000L, 60);
        verify(metricMapper).endpointRed("web-gateway", "production", "quasar", "pod-a", 0L, 120_000L);
        verify(metricMapper).instances("web-gateway", "production", "quasar", "pod-a", 0L, 120_000L);
        verify(metricMapper).jvm("web-gateway", "production", "quasar", "pod-a", 0L, 120_000L);
    }

    @Test
    void emptySeriesYieldsContinuousZeroBuckets() {
        when(metricMapper.series(any(), any(), any(), any(), any(), any(), any())).thenReturn(List.of());
        when(metricMapper.endpointRed(any(), any(), any(), any(), any(), any())).thenReturn(List.of());
        when(metricMapper.instances(any(), any(), any(), any(), any(), any())).thenReturn(List.of());
        when(metricMapper.jvm(any(), any(), any(), any(), any(), any())).thenReturn(List.of());

        MetricsResponseDTO metrics = service.metrics("web-gateway", null, null, null, 0L, 120_000L);

        assertThat(metrics.getSeries()).hasSize(2);
        assertThat(metrics.getSeries()).extracting("time").containsExactly(0L, 60_000L);
        assertThat(metrics.getSummary().getRps()).isZero();
        assertThat(metrics.getSummary().getErrorRate()).isZero();
        assertThat(metrics.getSummary().getCurrent().getTime()).isEqualTo(60_000L);
    }

    private static EndpointRedEntity endpoint(String operation, Long requests) {
        EndpointRedEntity endpoint = new EndpointRedEntity();
        endpoint.setOperation(operation);
        endpoint.setRequestCount(requests);
        endpoint.setErrorCount(0L);
        endpoint.setP50(1_000_000.0);
        endpoint.setP90(5_000_000.0);
        endpoint.setP99(9_000_000.0);
        return endpoint;
    }

    private static MetricSeriesSliceEntity slice(Long time, Double requests, Double errors,
            Double p50, Double p90, Double p99) {
        MetricSeriesSliceEntity slice = new MetricSeriesSliceEntity();
        slice.setTime(time);
        slice.setRequests(requests);
        slice.setErrors(errors);
        slice.setP50(p50);
        slice.setP90(p90);
        slice.setP99(p99);
        return slice;
    }

    private static MetricInstanceEntity instance(String serviceInstanceId, Long requests, Long errors,
            Double p99, Map<String, String> attrs) {
        MetricInstanceEntity instance = new MetricInstanceEntity();
        instance.setServiceInstanceId(serviceInstanceId);
        instance.setRequestCount(requests);
        instance.setErrorCount(errors);
        instance.setP99(p99);
        instance.setResourceAttributes(attrs);
        return instance;
    }

    private static JvmMetricEntity jvm(Double heapUsed, Double heapLimit, Double cpuUtilization,
            Double threadCount, Double gcDuration) {
        JvmMetricEntity metric = new JvmMetricEntity();
        metric.setServiceInstanceId("pod-a");
        metric.setHeapUsed(heapUsed);
        metric.setHeapLimit(heapLimit);
        metric.setCpuUtilization(cpuUtilization);
        metric.setThreadCount(threadCount);
        metric.setGcDuration(gcDuration);
        return metric;
    }
}
