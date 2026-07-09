package org.quasar.tracing.core.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.ToDoubleFunction;
import lombok.RequiredArgsConstructor;
import org.quasar.tracing.clickhouse.entity.JvmMetricEntity;
import org.quasar.tracing.clickhouse.entity.MetricInstanceEntity;
import org.quasar.tracing.clickhouse.entity.MetricSeriesSliceEntity;
import org.quasar.tracing.clickhouse.mapper.MetricMapper;
import org.quasar.tracing.common.dto.EndpointRedDTO;
import org.quasar.tracing.common.dto.JvmMetricsDTO;
import org.quasar.tracing.common.dto.MetricInstanceDTO;
import org.quasar.tracing.common.dto.MetricPointDTO;
import org.quasar.tracing.common.dto.MetricsResponseDTO;
import org.quasar.tracing.common.dto.MetricsSummaryDTO;
import org.quasar.tracing.common.util.TimeWindowUtil;
import org.springframework.stereotype.Service;

/**
 * Per-service RED metrics: the bucketed time series, the per-endpoint breakdown, and the
 * headline summary. Series points carry rps / errors-per-second / error <b>percent</b> (0..100)
 * and millisecond percentiles; the summary error rate is the <b>ratio</b> (0..1).
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Service
@RequiredArgsConstructor
public class MetricsService {

    private static final double NANOS_PER_MILLI = 1_000_000.0;

    private final MetricMapper metricMapper;
    private final EndpointRedAssembler endpointRedAssembler;

    public MetricsResponseDTO metrics(String service, String environment, String namespace,
            String serviceInstanceId, Long from, Long to) {
        Long toMs = TimeWindowUtil.resolveTo(to);
        Long fromMs = TimeWindowUtil.resolveFrom(from, toMs);
        Integer stepSec = TimeWindowUtil.stepSeconds(fromMs, toMs);
        Long stepMs = TimeWindowUtil.stepMs(fromMs, toMs);

        List<MetricPointDTO> series = completeSeries(metricMapper.series(service, environment, namespace,
            serviceInstanceId, fromMs, toMs, stepSec), fromMs, toMs, stepMs, stepSec);
        List<EndpointRedDTO> endpoints = endpointRedAssembler.assemble(
            metricMapper.endpointRed(service, environment, namespace, serviceInstanceId, fromMs, toMs), fromMs, toMs);
        List<MetricInstanceDTO> instances = instances(
            metricMapper.instances(service, environment, namespace, serviceInstanceId, fromMs, toMs), fromMs, toMs);
        JvmMetricsDTO jvm = jvm(metricMapper.jvm(service, environment, namespace, serviceInstanceId, fromMs, toMs));
        return new MetricsResponseDTO(service, stepMs, series, endpoints, instances, jvm, summarize(series));
    }

    private static MetricPointDTO toPoint(MetricSeriesSliceEntity slice, Integer stepSec) {
        Double requests = slice.getRequests() / stepSec;
        Double errors = slice.getErrors() / stepSec;
        Double errorRate = slice.getRequests() > 0 ? slice.getErrors() / slice.getRequests() * 100.0 : 0.0;
        return new MetricPointDTO(slice.getTime(), requests, errors, errorRate,
            nsToMs(slice.getP50()), nsToMs(slice.getP90()), nsToMs(slice.getP99()));
    }

    private static List<MetricPointDTO> completeSeries(List<MetricSeriesSliceEntity> slices,
            Long fromMs, Long toMs, Long stepMs, Integer stepSec) {
        Map<Long, MetricPointDTO> pointsByBucket = new LinkedHashMap<>();
        for (MetricSeriesSliceEntity slice : slices) {
            pointsByBucket.put(slice.getTime(), toPoint(slice, stepSec));
        }

        List<MetricPointDTO> points = new ArrayList<>();
        long start = TimeWindowUtil.alignBucketStart(fromMs, stepMs);
        for (long bucket = start; bucket < toMs; bucket += stepMs) {
            points.add(pointsByBucket.getOrDefault(bucket, new MetricPointDTO(bucket, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)));
        }
        return points;
    }

    private static MetricsSummaryDTO summarize(List<MetricPointDTO> series) {
        MetricPointDTO current = series.isEmpty() ? null : series.get(series.size() - 1);
        return new MetricsSummaryDTO(
            avg(series, MetricPointDTO::getRequests),
            avg(series, MetricPointDTO::getErrorRate) / 100.0,
            avg(series, MetricPointDTO::getP50),
            avg(series, MetricPointDTO::getP90),
            avg(series, MetricPointDTO::getP99),
            current);
    }

    private static List<MetricInstanceDTO> instances(List<MetricInstanceEntity> rows, Long fromMs, Long toMs) {
        double windowSeconds = Math.max(1.0, (toMs - fromMs) / 1000.0);
        return rows.stream()
            .map(row -> new MetricInstanceDTO(
                row.getServiceInstanceId(),
                runtimeType(row.getResourceAttributes()),
                displayName(row),
                row.getRequestCount(),
                row.getRequestCount() / windowSeconds,
                ratio(row.getErrorCount(), row.getRequestCount()),
                nsToMs(row.getP99()),
                row.getResourceAttributes()))
            .toList();
    }

    private static JvmMetricsDTO jvm(List<JvmMetricEntity> rows) {
        if (rows == null || rows.isEmpty()) {
            return null;
        }
        return new JvmMetricsDTO(
            rows.stream().mapToDouble(row -> value(row.getHeapUsed())).sum(),
            rows.stream().mapToDouble(row -> value(row.getHeapLimit())).sum(),
            avgJvm(rows, JvmMetricEntity::getCpuUtilization),
            rows.stream().mapToDouble(row -> value(row.getThreadCount())).sum(),
            avgJvm(rows, JvmMetricEntity::getGcDuration));
    }

    private static String runtimeType(Map<String, String> attrs) {
        if (has(attrs, "k8s.pod.name")) {
            return "pod";
        }
        if (has(attrs, "container.id") || has(attrs, "container.name") || has(attrs, "container.image.name")) {
            return "docker";
        }
        return "bare";
    }

    private static String displayName(MetricInstanceEntity row) {
        Map<String, String> attrs = row.getResourceAttributes();
        if (has(attrs, "k8s.pod.name")) {
            return attrs.get("k8s.pod.name");
        }
        if (has(attrs, "container.name")) {
            return attrs.get("container.name");
        }
        if (has(attrs, "host.name")) {
            return attrs.get("host.name");
        }
        return row.getServiceInstanceId();
    }

    private static boolean has(Map<String, String> attrs, String key) {
        return attrs != null && attrs.get(key) != null && !attrs.get(key).isBlank();
    }

    private static Double ratio(Long numerator, Long denominator) {
        return (denominator == null || denominator == 0) ? 0.0 : (double) numerator / denominator;
    }

    private static Double avg(List<MetricPointDTO> series, ToDoubleFunction<MetricPointDTO> field) {
        return series.isEmpty() ? 0.0 : series.stream().mapToDouble(field).average().orElse(0.0);
    }

    private static Double avgJvm(List<JvmMetricEntity> rows, ToDoubleFunction<JvmMetricEntity> field) {
        return rows.isEmpty() ? 0.0 : rows.stream().mapToDouble(field).average().orElse(0.0);
    }

    private static double value(Double value) {
        return value == null ? 0.0 : value;
    }

    private static Double nsToMs(Double ns) {
        return ns == null ? null : ns / NANOS_PER_MILLI;
    }
}
