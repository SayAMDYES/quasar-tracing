package org.quasar.tracing.common.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.quasar.tracing.common.json.TraceDocumentPrettyPrinter;

/**
 * Verifies stable JSON contracts exposed by common DTOs.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
class DtoSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void traceSummarySerializesWithExpectedFieldNames() throws Exception {
        TraceSummaryDTO summary = new TraceSummaryDTO("abc", "web-gateway", "GET /x", 1000L,
                120_000_000L, 3, 1, "Error", "production", "ip-1",
                "pod-uid-1", "quasar-ns", "web-gateway-abc", "pod-uid-1", "node-1",
                List.of("web-gateway", "mysql"), TraceSource.LIVE, null);

        String json = objectMapper.writeValueAsString(summary);

        assertThat(json).contains("\"traceId\":\"abc\"")
                .contains("\"durationNs\":\"120000000\"")
                .contains("\"startTime\":\"1000\"")
                .contains("\"k8sNamespace\":\"quasar-ns\"")
                .contains("\"status\":\"Error\"")
                .contains("\"source\":\"live\"");
    }

    @Test
    void traceDocumentMatchesGoldenFixtureByteForByte() throws Exception {
        List<TraceDocumentDTO> documents = List.of(
                naturalRootDocument(),
                multipleRootsDocument(),
                missingParentDocument(),
                parentCycleDocument());

        String canonicalJson = canonicalWriter().writeValueAsString(documents) + "\n";
        byte[] actual = canonicalJson.getBytes(StandardCharsets.UTF_8);

        assertThat(actual).isEqualTo(readGoldenFixture());
        assertThat(new String(actual, StandardCharsets.UTF_8))
                .contains("\"startTimeUnixNano\": \"18446744073709551616\"")
                .contains("\"selection\": \"natural\"")
                .contains("\"selection\": \"orphan\"")
                .contains("\"selection\": \"cycle\"")
                .contains("支付-service")
                .doesNotContain("[ {")
                .doesNotContain("[ \"x\" ]")
                .doesNotContain("[ ]")
                .doesNotContain("{ }")
                .doesNotContain("\"traceId\" :")
                .endsWith("\n")
                .doesNotEndWith("\n\n")
                .doesNotContain("\r");
    }

    @Test
    void canonicalWriterMatchesJsonStringifyPrettyFormat() throws Exception {
        String canonicalJson = canonicalWriter()
                .writeValueAsString(Map.of("key", List.of("x"))) + "\n";

        assertThat(canonicalJson).isEqualTo("""
                {
                  "key": [
                    "x"
                  ]
                }
                """)
                .doesNotContain("[ {")
                .doesNotContain("[ \"x\" ]")
                .doesNotContain("[ ]")
                .doesNotContain("{ }")
                .doesNotContain("\"key\" :");
    }

    @Test
    void traceDocumentDefaultsCollectionsAndMapsToNonNullEmptyValues() {
        TraceDocumentDTO document = new TraceDocumentDTO();
        TraceDocumentSpanDTO span = new TraceDocumentSpanDTO();
        TraceDocumentEventDTO event = new TraceDocumentEventDTO();
        TraceDocumentLinkDTO link = new TraceDocumentLinkDTO();

        assertThat(document.getServices()).isEmpty();
        assertThat(document.getWarnings()).isEmpty();
        assertThat(document.getSpans()).isEmpty();
        assertThat(span.getResourceAttributes()).isEmpty();
        assertThat(span.getSpanAttributes()).isEmpty();
        assertThat(span.getEvents()).isEmpty();
        assertThat(span.getLinks()).isEmpty();
        assertThat(event.getAttributes()).isEmpty();
        assertThat(link.getAttributes()).isEmpty();
    }

    @Test
    void traceAndSpanIdsNormalizeToFixedLowercaseHex() {
        assertThat(TraceDocumentDTO.normalizeTraceId("ABCDEFABCDEFABCDEFABCDEFABCDEFAB"))
                .isEqualTo("abcdefabcdefabcdefabcdefabcdefab");
        assertThat(TraceDocumentDTO.normalizeSpanId("ABCDEFABCDEFABCD"))
                .isEqualTo("abcdefabcdefabcd");

        assertThatThrownBy(() -> TraceDocumentDTO.normalizeTraceId("abc"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("INVALID_TRACE_ID");
        assertThatThrownBy(() -> TraceDocumentDTO.normalizeSpanId("abcdefabcdefabcg"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("INVALID_SPAN_ID");
    }

    @Test
    void canonicalTopologyRejectsEmptyAndNegativeSpanTimes() {
        assertThatThrownBy(() -> TraceDocumentDTO.canonicalize(traceId(9), List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("TRACE_HAS_NO_SPANS");

        TraceDocumentSpanDTO negativeStart = span(91, "", "-1", "1", "service", "negative");
        assertThatThrownBy(() -> TraceDocumentDTO.canonicalize(traceId(9), List.of(negativeStart)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("INVALID_START_TIME_UNIX_NANO");

        TraceDocumentSpanDTO negativeDuration = span(92, "", "1", "-1", "service", "negative");
        assertThatThrownBy(() -> TraceDocumentDTO.canonicalize(traceId(9), List.of(negativeDuration)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("INVALID_DURATION_NANO");
    }

    @Test
    void warningsAreTruncatedSortedAndDeduplicatedByUnicodeCodePoint() {
        String longMessage = "😀".repeat(513);
        TraceDocumentWarningDTO duplicate = warning("Z_WARNING", "", longMessage);

        TraceDocumentDTO document = TraceDocumentDTO.canonicalize(traceId(8),
                List.of(span(81, "", "1", "1", "service", "root")),
                List.of(duplicate, duplicate, warning("A_WARNING", "", "first")));

        assertThat(document.getWarnings()).extracting(TraceDocumentWarningDTO::getCode)
                .containsExactly("A_WARNING", "Z_WARNING");
        assertThat(document.getWarnings().get(1).getMessage().codePointCount(
                0, document.getWarnings().get(1).getMessage().length())).isEqualTo(512);
    }

    @Test
    void mapsSortByUnicodeCodePointRatherThanUtf16CodeUnit() {
        TraceDocumentSpanDTO span = span(71, "", "1", "1", "service", "root");
        span.setSpanAttributes(unsortedMap("😀", "supplementary", "\uE000", "private-use"));

        TraceDocumentDTO document = TraceDocumentDTO.canonicalize(traceId(7), List.of(span));

        assertThat(document.getSpans().get(0).getSpanAttributes().keySet())
                .containsExactly("\uE000", "😀");
    }

    @Test
    void naturalRootCategoryWinsOverAnEarlierOrphan() {
        TraceDocumentSpanDTO natural = span(61, "", "100", "1", "service", "natural");
        TraceDocumentSpanDTO orphan = span(62, spanId(69), "1", "1", "service", "orphan");

        TraceDocumentDTO document = TraceDocumentDTO.canonicalize(traceId(6), List.of(orphan, natural));

        assertThat(document.getRoot().getSpanId()).isEqualTo(spanId(61));
        assertThat(document.getRoot().getSelection()).isEqualTo("natural");
        assertThat(document.getWarnings()).extracting(TraceDocumentWarningDTO::getCode)
                .containsExactly("MISSING_PARENT", "MULTIPLE_ROOTS");
    }

    private TraceDocumentDTO naturalRootDocument() {
        TraceDocumentSpanDTO root = span(1, "", "18446744073709551616", "10",
                "支付-service", "处理订单");
        root.setTraceState("vendor=value");
        root.setKind("SERVER");
        root.getStatus().setCode("OK");
        root.getStatus().setMessage("完成");
        root.setResourceAttributes(unsortedMap("zone", "cn-south", "service.version", "1.0"));
        root.getScope().setName("otel.scope");
        root.getScope().setVersion("1.2.3");
        Map<String, String> spanAttributes = new HashMap<>();
        spanAttributes.put("说明", "值");
        spanAttributes.put("http.method", "POST");
        spanAttributes.put("2", "two");
        spanAttributes.put("10", "ten");
        root.setSpanAttributes(spanAttributes);

        TraceDocumentEventDTO event = new TraceDocumentEventDTO();
        event.setTimeUnixNano("18446744073709551617");
        event.setName("事件");
        event.setAttributes(unsortedMap("z", "last", "a", "first"));
        root.setEvents(List.of(event));

        TraceDocumentLinkDTO link = new TraceDocumentLinkDTO();
        link.setTraceId(traceId(2).toUpperCase());
        link.setSpanId(spanId(2).toUpperCase());
        link.setTraceState("linked=true");
        link.setAttributes(unsortedMap("z", "last", "a", "first"));
        root.setLinks(List.of(link));

        return TraceDocumentDTO.canonicalize(traceId(1).toUpperCase(), List.of(root));
    }

    private TraceDocumentDTO multipleRootsDocument() {
        TraceDocumentSpanDTO later = span(11, "", "100", "10", "支付-service", "later");
        TraceDocumentSpanDTO earlier = span(12, "", "90", "5", "alpha-service", "earlier");
        return TraceDocumentDTO.canonicalize(traceId(2), List.of(later, earlier));
    }

    private TraceDocumentDTO missingParentDocument() {
        TraceDocumentSpanDTO orphan = span(21, spanId(29), "200", "30", "orphan-service", "orphan");
        return TraceDocumentDTO.canonicalize(traceId(3), List.of(orphan));
    }

    private TraceDocumentDTO parentCycleDocument() {
        TraceDocumentSpanDTO later = span(31, spanId(32), "310", "10", "cycle-service", "later");
        TraceDocumentSpanDTO representative = span(32, spanId(31), "300", "5", "cycle-service", "representative");
        return TraceDocumentDTO.canonicalize(traceId(4), List.of(later, representative));
    }

    private TraceDocumentSpanDTO span(int id, String parentSpanId, String start, String duration,
            String serviceName, String name) {
        TraceDocumentSpanDTO span = new TraceDocumentSpanDTO();
        span.setSpanId(spanId(id));
        span.setParentSpanId(parentSpanId);
        span.setServiceName(serviceName);
        span.setName(name);
        span.setStartTimeUnixNano(start);
        span.setDurationNano(duration);
        return span;
    }

    private TraceDocumentWarningDTO warning(String code, String spanId, String message) {
        TraceDocumentWarningDTO warning = new TraceDocumentWarningDTO();
        warning.setCode(code);
        warning.setSpanId(spanId);
        warning.setMessage(message);
        return warning;
    }

    private Map<String, String> unsortedMap(String firstKey, String firstValue,
            String secondKey, String secondValue) {
        Map<String, String> attributes = new HashMap<>();
        attributes.put(firstKey, firstValue);
        attributes.put(secondKey, secondValue);
        return attributes;
    }

    private byte[] readGoldenFixture() throws Exception {
        try (InputStream input = getClass().getResourceAsStream("/trace-document-v1-golden.json")) {
            assertThat(input).isNotNull();
            return input.readAllBytes();
        }
    }

    private com.fasterxml.jackson.databind.ObjectWriter canonicalWriter() {
        return objectMapper.writer(new TraceDocumentPrettyPrinter());
    }

    private String traceId(int suffix) {
        return String.format("%032x", suffix);
    }

    private String spanId(int suffix) {
        return String.format("%016x", suffix);
    }
}
