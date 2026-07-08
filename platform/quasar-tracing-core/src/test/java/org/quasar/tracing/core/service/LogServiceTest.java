package org.quasar.tracing.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.quasar.tracing.clickhouse.entity.LogEntity;
import org.quasar.tracing.clickhouse.entity.LogHistogramSliceEntity;
import org.quasar.tracing.clickhouse.mapper.LogMapper;
import org.quasar.tracing.clickhouse.mapper.LogSearchFilter;
import org.quasar.tracing.common.dto.LogSearchResultDTO;
import org.quasar.tracing.core.config.QueryProperties;

/**
 * Unit tests for {@link LogService}: page assembly and the continuous histogram pivot.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
class LogServiceTest {

    private final LogMapper logMapper = Mockito.mock(LogMapper.class);
    private final LogService service = new LogService(logMapper, new QueryProperties(50, 100, 1000));

    @Test
    void buildsPageAndContinuousHistogram() {
        when(logMapper.search(any())).thenReturn(List.of(log()));
        when(logMapper.countSearch(any())).thenReturn(1L);
        when(logMapper.histogram(any())).thenReturn(List.of(slice(0L, "INFO", 2L), slice(60_000L, "ERROR", 1L)));

        // 2-minute window → 60s buckets → 3 continuous buckets: 0, 60000, 120000
        LogSearchResultDTO result = service.search("mysql", "t", "production", "quasar", "quasar-ns",
            "mysql-0", "node-1", "pod-uid-1",
            List.of(), null, 0L, 120_000L, null, null);

        assertThat(result.getPage().getTotal()).isEqualTo(1L);
        assertThat(result.getPage().getSize()).isEqualTo(100);
        assertThat(result.getPage().getRecords()).hasSize(1);
        assertThat(result.getPage().getRecords().get(0).getSeverity()).isEqualTo("ERROR");
        assertThat(result.getPage().getRecords().get(0).getEnvironment()).isEqualTo("production");
        assertThat(result.getPage().getRecords().get(0).getServiceInstanceId()).isEqualTo("pod-uid-1");

        ArgumentCaptor<LogSearchFilter> captor = ArgumentCaptor.forClass(LogSearchFilter.class);
        verify(logMapper).search(captor.capture());
        LogSearchFilter filter = captor.getValue();
        assertThat(filter.getEnvironment()).isEqualTo("production");
        assertThat(filter.getNamespace()).isEqualTo("quasar");
        assertThat(filter.getK8sNamespace()).isEqualTo("quasar-ns");
        assertThat(filter.getServiceInstanceId()).isEqualTo("pod-uid-1");

        List<Map<String, Object>> histogram = result.getHistogram();
        assertThat(histogram).hasSize(3);
        assertThat(histogram.get(0)).containsEntry("time", 0L).containsEntry("INFO", 2L);
        assertThat(histogram.get(1)).containsEntry("time", 60_000L).containsEntry("ERROR", 1L);
        assertThat(histogram.get(2)).containsEntry("time", 120_000L).doesNotContainKey("ERROR");
    }

    private static LogEntity log() {
        LogEntity e = new LogEntity();
        e.setTimestamp(30_000L);
        e.setTraceId("t");
        e.setSpanId("s");
        e.setSeverity("ERROR");
        e.setService("mysql");
        e.setBody("deadlock");
        e.setResourceAttributes(Map.of(
            "deployment.environment.name", "production",
            "service.instance.id", "pod-uid-1",
            "host.name", "h1"));
        return e;
    }

    private static LogHistogramSliceEntity slice(Long time, String severity, Long count) {
        LogHistogramSliceEntity slice = new LogHistogramSliceEntity();
        slice.setTime(time);
        slice.setSeverity(severity);
        slice.setCount(count);
        return slice;
    }
}
