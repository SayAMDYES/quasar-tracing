package org.quasar.tracing.core.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.ToDoubleFunction;
import lombok.RequiredArgsConstructor;
import org.quasar.tracing.clickhouse.entity.LogEntity;
import org.quasar.tracing.clickhouse.entity.MetricSeriesSliceEntity;
import org.quasar.tracing.clickhouse.entity.TraceCountsEntity;
import org.quasar.tracing.clickhouse.mapper.LogMapper;
import org.quasar.tracing.clickhouse.mapper.MetricMapper;
import org.quasar.tracing.clickhouse.mapper.OverviewMapper;
import org.quasar.tracing.common.dto.EndpointRedDTO;
import org.quasar.tracing.common.dto.LogRecordDTO;
import org.quasar.tracing.common.dto.OverviewKpisDTO;
import org.quasar.tracing.common.dto.OverviewPointDTO;
import org.quasar.tracing.common.dto.OverviewResponseDTO;
import org.quasar.tracing.common.dto.ServiceStatDTO;
import org.quasar.tracing.common.dto.TopEndpointDTO;
import org.quasar.tracing.common.util.TimeWindowUtil;
import org.springframework.stereotype.Service;

/**
 * Overview dashboard: the platform-wide RED series, headline KPIs, the busiest endpoints, the
 * app-service health table, and the most recent error logs. Series points carry error
 * <b>percent</b>; the KPI error rate is the <b>ratio</b> (avg series percent ÷ 100).
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Service
@RequiredArgsConstructor
public class OverviewService {

    private static final double NANOS_PER_MILLI = 1_000_000.0;
    private static final double DEGRADED_ERROR_RATE = 0.02;
    private static final double UNHEALTHY_ERROR_RATE = 0.20;
    private static final int TOP_ENDPOINT_LIMIT = 8;
    private static final int RECENT_ERROR_LIMIT = 8;

    private final OverviewMapper overviewMapper;
    private final ServiceMapService serviceMapService;
    private final MetricMapper metricMapper;
    private final LogMapper logMapper;
    private final EndpointRedAssembler endpointRedAssembler;

    public OverviewResponseDTO overview(Long from, Long to) {
        Long toMs = TimeWindowUtil.resolveTo(to);
        Long fromMs = TimeWindowUtil.resolveFrom(from, toMs);
        Integer stepSec = TimeWindowUtil.stepSeconds(fromMs, toMs);

        List<OverviewPointDTO> series = completeSeries(overviewMapper.platformSeries(fromMs, toMs, stepSec), fromMs,
            toMs, TimeWindowUtil.stepMs(fromMs, toMs), stepSec);
        List<ServiceStatDTO> appServices = serviceMapService.services(fromMs, toMs).stream()
            .filter(s -> "app".equals(s.getType())).toList();
        List<TopEndpointDTO> topEndpoints = topEndpoints(appServices, fromMs, toMs);
        TraceCountsEntity counts = overviewMapper.traceCounts(fromMs, toMs);
        List<LogRecordDTO> recentErrors = recentErrors(fromMs, toMs);

        OverviewKpisDTO kpis = new OverviewKpisDTO(
            avg(series, OverviewPointDTO::getRequests),
            avg(series, OverviewPointDTO::getErrorRate) / 100.0,
            avg(series, OverviewPointDTO::getP99),
            counts.getTotal(), counts.getErrors(), appServices.size(),
            (int) appServices.stream().filter(OverviewService::isUnhealthy).count(),
            (int) appServices.stream().filter(OverviewService::isDegraded).count());

        return new OverviewResponseDTO(kpis, series, topEndpoints, appServices, recentErrors);
    }

    private List<TopEndpointDTO> topEndpoints(List<ServiceStatDTO> appServices, Long fromMs, Long toMs) {
        return appServices.stream()
            .flatMap(s -> endpointRedAssembler.assemble(
                metricMapper.endpointRed(s.getName(), null, null, null, fromMs, toMs), fromMs, toMs)
                .stream().map(red -> toTopEndpoint(s.getName(), red)))
            .filter(endpoint -> EndpointOperationFilter.isMeaningful(endpoint.getOperation()))
            .sorted(Comparator.comparingDouble(TopEndpointDTO::getRps).reversed())
            .limit(TOP_ENDPOINT_LIMIT)
            .toList();
    }

    private static boolean isUnhealthy(ServiceStatDTO service) {
        return service.getErrorRate() != null && service.getErrorRate() >= UNHEALTHY_ERROR_RATE;
    }

    private static boolean isDegraded(ServiceStatDTO service) {
        return service.getErrorRate() != null
            && service.getErrorRate() >= DEGRADED_ERROR_RATE
            && service.getErrorRate() < UNHEALTHY_ERROR_RATE;
    }

    private List<LogRecordDTO> recentErrors(Long fromMs, Long toMs) {
        List<LogEntity> rows = logMapper.recentErrors(fromMs, toMs, RECENT_ERROR_LIMIT);
        List<LogRecordDTO> errors = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            LogEntity e = rows.get(i);
            errors.add(new LogRecordDTO(e.getTimestamp() + "-" + i, e.getTimestamp(), e.getTraceId(),
                e.getSpanId(), e.getService(), e.getSeverity(), e.getBody(), e.getEnvironment(), e.getHost(),
                e.getServiceInstanceId(), e.getK8sNamespace(), e.getK8sPodName(),
                e.getK8sPodUid(), e.getK8sNodeName(), e.getResourceAttributes()));
        }
        return errors;
    }

    private static OverviewPointDTO toPoint(MetricSeriesSliceEntity slice, Integer stepSec) {
        Double requests = slice.getRequests() / stepSec;
        Double errors = slice.getErrors() / stepSec;
        Double errorRate = slice.getRequests() > 0 ? slice.getErrors() / slice.getRequests() * 100.0 : 0.0;
        return new OverviewPointDTO(slice.getTime(), requests, errors, errorRate, nsToMs(slice.getP99()));
    }

    private static List<OverviewPointDTO> completeSeries(List<MetricSeriesSliceEntity> slices,
            Long fromMs, Long toMs, Long stepMs, Integer stepSec) {
        Map<Long, OverviewPointDTO> pointsByBucket = new LinkedHashMap<>();
        for (MetricSeriesSliceEntity slice : slices) {
            pointsByBucket.put(slice.getTime(), toPoint(slice, stepSec));
        }

        List<OverviewPointDTO> points = new ArrayList<>();
        long start = TimeWindowUtil.alignBucketStart(fromMs, stepMs);
        for (long bucket = start; bucket < toMs; bucket += stepMs) {
            points.add(pointsByBucket.getOrDefault(bucket, new OverviewPointDTO(bucket, 0.0, 0.0, 0.0, 0.0)));
        }
        return points;
    }

    private static TopEndpointDTO toTopEndpoint(String service, EndpointRedDTO red) {
        return new TopEndpointDTO(service, red.getOperation(), red.getRequestCount(), red.getRps(),
            red.getErrorRate(), red.getP50(), red.getP90(), red.getP99());
    }

    private static Double avg(List<OverviewPointDTO> series, ToDoubleFunction<OverviewPointDTO> field) {
        return series.isEmpty() ? 0.0 : series.stream().mapToDouble(field).average().orElse(0.0);
    }

    private static Double nsToMs(Double ns) {
        return ns == null ? null : ns / NANOS_PER_MILLI;
    }
}
