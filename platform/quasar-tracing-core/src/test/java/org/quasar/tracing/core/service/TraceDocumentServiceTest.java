package org.quasar.tracing.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.quasar.tracing.clickhouse.entity.SpanEntity;
import org.quasar.tracing.clickhouse.entity.TraceArchiveManifestEntity;
import org.quasar.tracing.clickhouse.mapper.SpanMapper;
import org.quasar.tracing.clickhouse.mapper.TraceArchiveMapper;
import org.quasar.tracing.common.dto.TraceDocumentDTO;
import org.quasar.tracing.common.dto.TraceDocumentEventDTO;
import org.quasar.tracing.common.dto.TraceDocumentLinkDTO;
import org.quasar.tracing.common.dto.TraceDocumentSpanDTO;
import org.quasar.tracing.common.dto.TraceDocumentWarningDTO;
import org.quasar.tracing.common.dto.TraceSource;
import org.quasar.tracing.common.json.TraceDocumentPrettyPrinter;
import org.quasar.tracing.core.exception.InvalidQueryException;
import org.quasar.tracing.core.exception.NotFoundException;
import org.quasar.tracing.core.exception.TraceDocumentTooLargeException;
import org.quasar.tracing.core.config.ArchiveProperties;

/**
 * Unit tests for live Span row conversion into canonical trace documents.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
class TraceDocumentServiceTest {

    private static final String TRACE_ID = "00000000000000000000000000000001";

    private final SpanMapper spanMapper = Mockito.mock(SpanMapper.class);

    private final TraceDocumentService service =
            new TraceDocumentService(spanMapper, new ObjectMapper());

    @Test
    void preservesNanosecondsMapsAllFieldsAndCanonicalizesWithoutMutatingRows() {
        SpanEntity later = span(2, "0000000000000001", "18446744073709551620", "7");
        later.setTraceState("vendor=value");
        later.setStatusCode("ERROR");
        later.setStatusMessage("failed");
        later.setScopeName("scope-name");
        later.setScopeVersion("1.2.3");
        later.setResourceAttributes(unsortedMap("z", "last", "a", "first"));
        later.setSpanAttributes(unsortedMap("b", "second", "a", "first"));
        later.setEventNames(List.of("second", "first"));
        later.setEventTimeUnixNanos(List.of("18446744073709551622", "18446744073709551621"));
        later.setEventAttributes(List.of(Map.of("z", "2"), Map.of("a", "1")));
        later.setLinkTraceIds(List.of(traceId(3), traceId(2)));
        later.setLinkSpanIds(List.of(spanId(3), spanId(2)));
        later.setLinkTraceStates(List.of("third", "second"));
        later.setLinkAttributes(List.of(Map.of("z", "2"), Map.of("a", "1")));

        SpanEntity root = span(1, "", "18446744073709551616", "2");
        root.setServiceName("root-service");
        when(spanMapper.selectByTraceId(TRACE_ID)).thenReturn(List.of(later, root));

        TraceDocumentDTO document = service.get(TRACE_ID.toUpperCase(), TraceSource.LIVE);

        assertThat(document.getTraceId()).isEqualTo(TRACE_ID);
        assertThat(document.getStartTimeUnixNano()).isEqualTo("18446744073709551616");
        assertThat(document.getDurationNano()).isEqualTo("11");
        assertThat(document.getRoot().getSpanId()).isEqualTo(spanId(1));
        assertThat(document.getSpans()).extracting(TraceDocumentSpanDTO::getSpanId)
                .containsExactly(spanId(1), spanId(2));

        TraceDocumentSpanDTO mapped = document.getSpans().get(1);
        assertThat(mapped.getStartTimeUnixNano()).isEqualTo("18446744073709551620");
        assertThat(mapped.getDurationNano()).isEqualTo("7");
        assertThat(mapped.getTraceState()).isEqualTo("vendor=value");
        assertThat(mapped.getStatus().getCode()).isEqualTo("ERROR");
        assertThat(mapped.getStatus().getMessage()).isEqualTo("failed");
        assertThat(mapped.getScope().getName()).isEqualTo("scope-name");
        assertThat(mapped.getScope().getVersion()).isEqualTo("1.2.3");
        assertThat(mapped.getResourceAttributes().keySet()).containsExactly("a", "z");
        assertThat(mapped.getSpanAttributes().keySet()).containsExactly("a", "b");
        assertThat(mapped.getEvents()).extracting(TraceDocumentEventDTO::getName)
                .containsExactly("second", "first");
        assertThat(mapped.getLinks()).extracting(TraceDocumentLinkDTO::getTraceState)
                .containsExactly("third", "second");
        assertThat(later.getEventNames()).containsExactly("second", "first");
        assertThat(later.getResourceAttributes().keySet()).containsExactlyInAnyOrder("z", "a");
        verify(spanMapper).selectByTraceId(TRACE_ID);
    }

    @Test
    void sortsEqualStartBySpanIdAndSerializesSourceLowercase() throws Exception {
        SpanEntity higher = span(2, "", "100", "1");
        SpanEntity lower = span(1, "", "100", "1");
        when(spanMapper.selectByTraceId(TRACE_ID)).thenReturn(List.of(higher, lower));

        assertThat(service.get(TRACE_ID, TraceSource.AUTO).getSpans())
                .extracting(TraceDocumentSpanDTO::getSpanId)
                .containsExactly(spanId(1), spanId(2));
        assertThat(new ObjectMapper().writeValueAsString(TraceSource.LIVE)).isEqualTo("\"live\"");
        assertThatThrownBy(() -> TraceSource.fromValue("remote"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("INVALID_TRACE_SOURCE");
    }

    @Test
    void derivesWarningsForMultipleRootsMissingParentAndCycles() {
        SpanEntity naturalOne = span(1, "", "10", "1");
        SpanEntity naturalTwo = span(2, "", "20", "1");
        SpanEntity orphan = span(3, spanId(99), "30", "1");
        SpanEntity selfCycle = span(4, spanId(4), "40", "1");
        SpanEntity cycleOne = span(5, spanId(6), "50", "1");
        SpanEntity cycleTwo = span(6, spanId(5), "60", "1");
        when(spanMapper.selectByTraceId(TRACE_ID))
                .thenReturn(List.of(cycleTwo, orphan, naturalTwo, selfCycle, cycleOne, naturalOne));

        TraceDocumentDTO document = service.get(TRACE_ID, TraceSource.LIVE);

        assertThat(document.getRoot().getSpanId()).isEqualTo(spanId(1));
        assertThat(document.getRoot().getSelection()).isEqualTo("natural");
        assertThat(document.getWarnings()).extracting(TraceDocumentWarningDTO::getCode)
                .containsExactly("MISSING_PARENT", "MULTIPLE_ROOTS", "PARENT_CYCLE", "PARENT_CYCLE");
        assertThat(document.getWarnings().stream()
                .filter(warning -> "PARENT_CYCLE".equals(warning.getCode()))
                .map(TraceDocumentWarningDTO::getSpanId))
                .containsExactly(spanId(4), spanId(5));
    }

    @Test
    void rejectsInvalidIdMissingTraceAndDisabledArchive() {
        assertThatThrownBy(() -> service.get("bad", TraceSource.LIVE))
                .isInstanceOf(InvalidQueryException.class)
                .hasMessage("INVALID_TRACE_ID");
        verifyNoInteractions(spanMapper);

        when(spanMapper.selectByTraceId(TRACE_ID)).thenReturn(List.of());
        assertThatThrownBy(() -> service.get(TRACE_ID, TraceSource.LIVE))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("Trace not found: " + TRACE_ID);

        assertThatThrownBy(() -> service.get(TRACE_ID, TraceSource.ARCHIVE))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("TRACE_ARCHIVE_FEATURE_DISABLED");
    }

    @Test
    void exposesZeroSpanCanonicalErrorThroughDocumentBuilder() {
        assertThatThrownBy(() -> service.toDocument(TRACE_ID, List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("TRACE_HAS_NO_SPANS");
    }

    @Test
    void acceptsTwentyThousandSpansAndRejectsOneMore() {
        List<SpanEntity> rows = new ArrayList<>(20_001);
        for (int i = 1; i <= 20_000; i++) {
            rows.add(span(i, "", Integer.toString(i), "1"));
        }
        when(spanMapper.selectByTraceId(TRACE_ID)).thenReturn(rows);

        assertThat(service.get(TRACE_ID, TraceSource.LIVE).getSpans()).hasSize(20_000);

        rows.add(span(20_001, "", "20001", "1"));

        assertThatThrownBy(() -> service.get(TRACE_ID, TraceSource.LIVE))
                .isInstanceOf(TraceDocumentTooLargeException.class)
                .hasMessage(TraceDocumentTooLargeException.ERROR_IDENTIFIER);
    }

    @Test
    void countsExactCanonicalUtf8BytesIncludingTrailingLf() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        SpanEntity row = span(1, "", "100", "1");
        row.setStatusMessage("支付失败".repeat(100));
        when(spanMapper.selectByTraceId(TRACE_ID)).thenReturn(List.of(row));

        assertThat("支付失败".getBytes(StandardCharsets.UTF_8).length).isGreaterThan("支付失败".length());
        TraceDocumentDTO document = service.get(TRACE_ID, TraceSource.LIVE);
        long canonicalBytes = objectMapper.writer(new TraceDocumentPrettyPrinter())
                .writeValueAsBytes(document).length + 1L;

        TraceDocumentService exactLimitService =
                new TraceDocumentService(spanMapper, objectMapper, 20_000, canonicalBytes);
        assertThat(exactLimitService.get(TRACE_ID, TraceSource.LIVE)).isEqualTo(document);

        TraceDocumentService oneByteTooSmallService =
                new TraceDocumentService(spanMapper, objectMapper, 20_000, canonicalBytes - 1);
        assertThatThrownBy(() -> oneByteTooSmallService.get(TRACE_ID, TraceSource.LIVE))
                .isInstanceOf(TraceDocumentTooLargeException.class)
                .hasMessage(TraceDocumentTooLargeException.ERROR_IDENTIFIER);
    }

    @Test
    void rejectsMisalignedEventAndLinkArraysBeforeMapping() {
        SpanEntity badEvents = span(1, "", "100", "1");
        badEvents.setEventNames(List.of("event"));
        badEvents.setEventTimeUnixNanos(List.of());
        badEvents.setEventAttributes(List.of(Map.of()));
        when(spanMapper.selectByTraceId(TRACE_ID)).thenReturn(List.of(badEvents));

        assertThatThrownBy(() -> service.get(TRACE_ID, TraceSource.LIVE))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("INVALID_STORED_SPAN_ARRAYS");

        SpanEntity badLinks = span(2, "", "100", "1");
        badLinks.setLinkTraceIds(List.of(traceId(2)));
        badLinks.setLinkSpanIds(List.of());
        badLinks.setLinkTraceStates(List.of(""));
        badLinks.setLinkAttributes(List.of(Map.of()));
        when(spanMapper.selectByTraceId(TRACE_ID)).thenReturn(List.of(badLinks));

        assertThatThrownBy(() -> service.get(TRACE_ID, TraceSource.LIVE))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("INVALID_STORED_SPAN_ARRAYS");
    }

    @Test
    void resolvesExplicitArchiveAndAutoFallbackFromTheLatestActiveGeneration() {
        TraceArchiveMapper archiveMapper = Mockito.mock(TraceArchiveMapper.class);
        TraceArchiveManifestEntity manifest = new TraceArchiveManifestEntity();
        manifest.setState("ACTIVE");
        manifest.setGeneration("generation-1");
        manifest.setExpiresAt(System.currentTimeMillis() + 60_000L);
        SpanEntity archived = span(1, "", "100", "10");
        when(spanMapper.selectByTraceId(TRACE_ID)).thenReturn(List.of());
        when(archiveMapper.selectLatest(TRACE_ID)).thenReturn(manifest);
        when(archiveMapper.selectGeneration(TRACE_ID, "generation-1"))
                .thenReturn(List.of(archived));
        TraceDocumentService archiveService = new TraceDocumentService(
                spanMapper, archiveMapper, new ArchiveProperties(true, 180, 20_000),
                new ObjectMapper(), 20_000, 50L * 1024 * 1024);

        assertThat(archiveService.get(TRACE_ID, TraceSource.ARCHIVE).getTraceId())
                .isEqualTo(TRACE_ID);
        assertThat(archiveService.get(TRACE_ID, TraceSource.AUTO).getTraceId())
                .isEqualTo(TRACE_ID);
    }

    private static SpanEntity span(int id, String parentSpanId, String start, String duration) {
        SpanEntity span = new SpanEntity();
        span.setTraceId(TRACE_ID);
        span.setSpanId(spanId(id));
        span.setParentSpanId(parentSpanId);
        span.setTraceState("");
        span.setServiceName("service-" + id);
        span.setSpanName("span-" + id);
        span.setSpanKind("INTERNAL");
        span.setStartTimeUnixNano(start);
        span.setDurationNano(duration);
        span.setStatusCode("UNSET");
        span.setStatusMessage("");
        span.setResourceAttributes(Map.of());
        span.setScopeName("");
        span.setScopeVersion("");
        span.setSpanAttributes(Map.of());
        span.setEventNames(List.of());
        span.setEventTimeUnixNanos(List.of());
        span.setEventAttributes(List.of());
        span.setLinkTraceIds(List.of());
        span.setLinkSpanIds(List.of());
        span.setLinkTraceStates(List.of());
        span.setLinkAttributes(List.of());
        return span;
    }

    private static Map<String, String> unsortedMap(
            String firstKey, String firstValue, String secondKey, String secondValue) {
        Map<String, String> attributes = new HashMap<>();
        attributes.put(firstKey, firstValue);
        attributes.put(secondKey, secondValue);
        return attributes;
    }

    private static String traceId(int suffix) {
        return String.format("%032x", suffix);
    }

    private static String spanId(int suffix) {
        return String.format("%016x", suffix);
    }
}
