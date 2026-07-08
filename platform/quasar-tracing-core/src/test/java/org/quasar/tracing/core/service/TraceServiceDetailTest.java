package org.quasar.tracing.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.quasar.tracing.clickhouse.entity.SpanEntity;
import org.quasar.tracing.clickhouse.mapper.LogMapper;
import org.quasar.tracing.clickhouse.mapper.SpanMapper;
import org.quasar.tracing.clickhouse.mapper.TraceMapper;
import org.quasar.tracing.common.dto.SpanDTO;
import org.quasar.tracing.common.dto.TraceDetailDTO;
import org.quasar.tracing.core.config.QueryProperties;
import org.quasar.tracing.core.exception.NotFoundException;

/**
 * Unit tests for {@link TraceService#detail}: offset / depth derivation and event zipping.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
class TraceServiceDetailTest {

    private final TraceMapper traceMapper = Mockito.mock(TraceMapper.class);
    private final SpanMapper spanMapper = Mockito.mock(SpanMapper.class);
    private final LogMapper logMapper = Mockito.mock(LogMapper.class);
    private final TraceService service =
        new TraceService(traceMapper, spanMapper, logMapper, new QueryProperties(50, 100, 1000));

    @Test
    void buildsDetailWithOffsetsDepthAndEvents() {
        when(spanMapper.selectByTraceId("t1")).thenReturn(List.of(root(), child()));

        TraceDetailDTO detail = service.detail("t1");

        assertThat(detail.getServices()).containsExactly("web-gateway", "mysql");
        assertThat(detail.getSummary().getEnvironment()).isEqualTo("production");
        assertThat(detail.getSummary().getStatus()).isEqualTo("Error");
        assertThat(detail.getSummary().getErrorCount()).isEqualTo(1);
        assertThat(detail.getSummary().getSpanCount()).isEqualTo(2);

        SpanDTO rootSpan = span(detail, "s1");
        assertThat(rootSpan.getOffsetMs()).isEqualTo(0d);
        assertThat(rootSpan.getDepth()).isEqualTo(0);

        SpanDTO childSpan = span(detail, "s2");
        assertThat(childSpan.getOffsetMs()).isEqualTo(50d);
        assertThat(childSpan.getDepth()).isEqualTo(1);
        assertThat(childSpan.getDurationMs()).isEqualTo(5d);
        assertThat(childSpan.getEvents()).hasSize(1);
        assertThat(childSpan.getEvents().get(0).getName()).isEqualTo("exception");
        assertThat(childSpan.getEvents().get(0).getTimestamp()).isEqualTo(1052L);
        assertThat(childSpan.getEvents().get(0).getAttributes()).containsEntry("exception.message", "boom");
    }

    @Test
    void throwsNotFoundForUnknownTrace() {
        when(spanMapper.selectByTraceId("missing")).thenReturn(List.of());
        assertThatThrownBy(() -> service.detail("missing")).isInstanceOf(NotFoundException.class);
    }

    private static SpanDTO span(TraceDetailDTO detail, String spanId) {
        return detail.getSpans().stream()
            .filter(s -> s.getSpanId().equals(spanId)).findFirst().orElseThrow();
    }

    private static SpanEntity root() {
        SpanEntity s = new SpanEntity();
        s.setTraceId("t1");
        s.setSpanId("s1");
        s.setParentSpanId("");
        s.setServiceName("web-gateway");
        s.setSpanName("GET /api/checkout");
        s.setSpanKind("Server");
        s.setTimestamp(1000L);
        s.setDuration(120_000_000L);
        s.setStatusCode("Ok");
        s.setStatusMessage("");
        s.setResourceAttributes(Map.of("deployment.environment.name", "production", "host.name", "h1"));
        s.setSpanAttributes(Map.of());
        return s;
    }

    private static SpanEntity child() {
        SpanEntity s = new SpanEntity();
        s.setTraceId("t1");
        s.setSpanId("s2");
        s.setParentSpanId("s1");
        s.setServiceName("mysql");
        s.setSpanName("SELECT");
        s.setSpanKind("Client");
        s.setTimestamp(1050L);
        s.setDuration(5_000_000L);
        s.setStatusCode("Error");
        s.setStatusMessage("deadlock");
        s.setResourceAttributes(Map.of("deployment.environment.name", "production", "host.name", "h2"));
        s.setSpanAttributes(Map.of("db.system", "mysql"));
        s.setEventNames(List.of("exception"));
        s.setEventTimestamps(List.of(1052L));
        s.setEventAttributes(List.of(Map.of("exception.message", "boom")));
        return s;
    }
}
