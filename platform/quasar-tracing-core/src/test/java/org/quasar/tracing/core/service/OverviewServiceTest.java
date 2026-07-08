package org.quasar.tracing.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.quasar.tracing.clickhouse.entity.EndpointRedEntity;
import org.quasar.tracing.clickhouse.entity.LogEntity;
import org.quasar.tracing.clickhouse.entity.MetricSeriesSliceEntity;
import org.quasar.tracing.clickhouse.entity.TraceCountsEntity;
import org.quasar.tracing.clickhouse.mapper.LogMapper;
import org.quasar.tracing.clickhouse.mapper.MetricMapper;
import org.quasar.tracing.clickhouse.mapper.OverviewMapper;
import org.quasar.tracing.common.dto.OverviewResponseDTO;
import org.quasar.tracing.common.dto.ServiceStatDTO;

/**
 * Unit tests for {@link OverviewService}: KPI ratio, app-only service filtering, service health
 * severity, and rps-sorted top endpoints.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
class OverviewServiceTest {

    private final OverviewMapper overviewMapper = Mockito.mock(OverviewMapper.class);
    private final ServiceMapService serviceMapService = Mockito.mock(ServiceMapService.class);
    private final MetricMapper metricMapper = Mockito.mock(MetricMapper.class);
    private final LogMapper logMapper = Mockito.mock(LogMapper.class);
    private final OverviewService service = new OverviewService(
        overviewMapper, serviceMapService, metricMapper, logMapper, new EndpointRedAssembler());

    @Test
    void assemblesKpisFilteredServicesAndTopEndpoints() {
        when(overviewMapper.platformSeries(any(), any(), any())).thenReturn(List.of(
            seriesSlice(0L, 120.0, 12.0, 9_000_000.0),
            seriesSlice(60_000L, 60.0, 0.0, 8_000_000.0)));
        when(overviewMapper.traceCounts(any(), any())).thenReturn(counts(5, 1));
        when(serviceMapService.services(any(), any())).thenReturn(List.of(
            stat("web-gateway", "app", 0.1), stat("mysql", "datastore", 0.5),
            stat("healthy", "app", 0.01), stat("broken", "app", 0.25)));
        when(metricMapper.endpointRed(eq("web-gateway"), any(), any(), any(), any(), any())).thenReturn(List.of(
            endpoint("GET", 500L),
            endpoint("HTTP", 450L),
            endpoint("GET /*", 400L),
            endpoint("HTTP /*", 375L),
            endpoint("GET /api/*", 350L),
            endpoint("GET /", 300L),
            endpoint("OPTIONS /api/v1/users/me", 250L),
            endpoint("POST /api", 225L),
            endpoint("GET /error", 200L),
            endpoint("GET /x", 100L)));
        when(metricMapper.endpointRed(eq("healthy"), any(), any(), any(), any(), any())).thenReturn(List.of(endpoint("GET /y", 50L)));
        when(metricMapper.endpointRed(eq("broken"), any(), any(), any(), any(), any())).thenReturn(List.of(endpoint("GET /z", 40L)));
        when(logMapper.recentErrors(any(), any(), any())).thenReturn(List.of(errorLog()));

        // 2-minute window → stepSec = 60
        OverviewResponseDTO overview = service.overview(0L, 120_000L);

        assertThat(overview.getServices()).extracting("name").containsExactly("web-gateway", "healthy", "broken");
        assertThat(overview.getKpis().getServiceCount()).isEqualTo(3);
        assertThat(overview.getKpis().getDegradedCount()).isEqualTo(1);
        assertThat(overview.getKpis().getUnhealthyCount()).isEqualTo(1);
        assertThat(overview.getKpis().getErrorRate()).isEqualTo(0.05);     // avg(10, 0) / 100
        assertThat(overview.getKpis().getTraceCount()).isEqualTo(5);
        assertThat(overview.getKpis().getErrorTraceCount()).isEqualTo(1);
        assertThat(overview.getSeries()).hasSize(2);
        assertThat(overview.getSeries().get(0).getErrorRate()).isEqualTo(10.0);  // percent
        assertThat(overview.getTopEndpoints()).extracting("service", "operation")
            .containsExactly(tuple("web-gateway", "GET /x"), tuple("healthy", "GET /y"), tuple("broken", "GET /z"));
        assertThat(overview.getRecentErrors()).hasSize(1);
    }

    private static MetricSeriesSliceEntity seriesSlice(Long time, Double requests, Double errors, Double p99) {
        MetricSeriesSliceEntity slice = new MetricSeriesSliceEntity();
        slice.setTime(time);
        slice.setRequests(requests);
        slice.setErrors(errors);
        slice.setP50(1_000_000.0);
        slice.setP90(5_000_000.0);
        slice.setP99(p99);
        return slice;
    }

    private static TraceCountsEntity counts(Integer total, Integer errors) {
        TraceCountsEntity c = new TraceCountsEntity();
        c.setTotal(total);
        c.setErrors(errors);
        return c;
    }

    private static ServiceStatDTO stat(String name, String type, Double errorRate) {
        return new ServiceStatDTO(name, type, null, 100L, errorRate, 2_000_000.0,
            1_000_000.0, 5_000_000.0, 9_000_000.0, 0, 0);
    }

    private static EndpointRedEntity endpoint(String operation, Long requestCount) {
        EndpointRedEntity e = new EndpointRedEntity();
        e.setOperation(operation);
        e.setRequestCount(requestCount);
        e.setErrorCount(0L);
        e.setP50(1_000_000.0);
        e.setP90(5_000_000.0);
        e.setP99(9_000_000.0);
        return e;
    }

    private static LogEntity errorLog() {
        LogEntity e = new LogEntity();
        e.setTimestamp(30_000L);
        e.setTraceId("t");
        e.setSpanId("s");
        e.setSeverity("ERROR");
        e.setService("mysql");
        e.setBody("deadlock");
        e.setResourceAttributes(Map.of("deployment.environment.name", "production", "host.name", "h1"));
        return e;
    }
}
