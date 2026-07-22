package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import java.io.Serializable;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Pattern;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Stable normalized representation of one trace.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
@Data
@NoArgsConstructor
@JsonPropertyOrder({
        "traceId", "startTimeUnixNano", "durationNano", "root", "services", "warnings", "spans"
})
public class TraceDocumentDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private static final Pattern TRACE_ID_PATTERN = Pattern.compile("[0-9a-fA-F]{32}");

    private static final Pattern SPAN_ID_PATTERN = Pattern.compile("[0-9a-fA-F]{16}");

    private static final Pattern UNSIGNED_DECIMAL_PATTERN = Pattern.compile("[0-9]+");

    private static final int MAX_WARNING_MESSAGE_CODE_POINTS = 512;

    private static final Comparator<String> UNICODE_COMPARATOR = TraceDocumentDTO::compareUnicode;

    private static final Comparator<TraceDocumentWarningDTO> WARNING_COMPARATOR =
            Comparator.comparing(TraceDocumentWarningDTO::getCode, UNICODE_COMPARATOR)
                    .thenComparing(TraceDocumentWarningDTO::getSpanId, UNICODE_COMPARATOR)
                    .thenComparing(TraceDocumentWarningDTO::getMessage, UNICODE_COMPARATOR);

    private String traceId = "";

    private String startTimeUnixNano = "";

    private String durationNano = "";

    private TraceDocumentRootDTO root = new TraceDocumentRootDTO();

    private List<String> services = new ArrayList<>();

    private List<TraceDocumentWarningDTO> warnings = new ArrayList<>();

    private List<TraceDocumentSpanDTO> spans = new ArrayList<>();

    /**
     * Creates the canonical document and derives its topology from stored parent IDs.
     *
     * @param traceId trace identifier
     * @param spans stored spans
     * @return canonical trace document
     */
    public static TraceDocumentDTO canonicalize(String traceId, List<TraceDocumentSpanDTO> spans) {
        return canonicalize(traceId, spans, List.of());
    }

    /**
     * Creates the canonical document and merges caller-supplied normalization warnings.
     *
     * @param traceId trace identifier
     * @param spans stored spans
     * @param warnings additional warnings
     * @return canonical trace document
     */
    public static TraceDocumentDTO canonicalize(String traceId, List<TraceDocumentSpanDTO> spans,
            List<TraceDocumentWarningDTO> warnings) {
        String normalizedTraceId = normalizeTraceId(traceId);
        if (spans == null || spans.isEmpty()) {
            throw new IllegalArgumentException("TRACE_HAS_NO_SPANS");
        }

        List<SpanNode> nodes = normalizeSpans(normalizedTraceId, spans);
        nodes.sort(SpanNode.ORDER);

        Map<String, SpanNode> nodesById = new LinkedHashMap<>();
        for (SpanNode node : nodes) {
            if (nodesById.put(node.span().getSpanId(), node) != null) {
                throw new IllegalArgumentException("DUPLICATE_SPAN_ID");
            }
        }

        List<TraceDocumentWarningDTO> derivedWarnings = new ArrayList<>();
        List<SpanNode> naturalRoots = new ArrayList<>();
        List<SpanNode> orphanRoots = new ArrayList<>();
        for (SpanNode node : nodes) {
            String parentSpanId = node.span().getParentSpanId();
            if (parentSpanId.isEmpty()) {
                naturalRoots.add(node);
            } else if (!nodesById.containsKey(parentSpanId)) {
                orphanRoots.add(node);
                derivedWarnings.add(warning("MISSING_PARENT", node.span().getSpanId(),
                        "Parent span not found: " + parentSpanId));
            }
        }

        List<SpanNode> cycleRoots = findCycleRepresentatives(nodes, nodesById);
        for (SpanNode cycleRoot : cycleRoots) {
            derivedWarnings.add(warning("PARENT_CYCLE", cycleRoot.span().getSpanId(),
                    "Parent cycle detected"));
        }

        naturalRoots.sort(SpanNode.ORDER);
        orphanRoots.sort(SpanNode.ORDER);
        cycleRoots.sort(SpanNode.ORDER);
        RootSelection rootSelection = selectRoot(naturalRoots, orphanRoots, cycleRoots);
        if (naturalRoots.size() + orphanRoots.size() + cycleRoots.size() > 1) {
            derivedWarnings.add(warning("MULTIPLE_ROOTS", "", "Trace has multiple root candidates"));
        }

        BigInteger start = nodes.stream().map(SpanNode::start).min(BigInteger::compareTo).orElseThrow();
        BigInteger end = nodes.stream().map(node -> node.start().add(node.duration()))
                .max(BigInteger::compareTo).orElseThrow();

        TraceDocumentDTO document = new TraceDocumentDTO();
        document.setTraceId(normalizedTraceId);
        document.setStartTimeUnixNano(start.toString());
        document.setDurationNano(end.subtract(start).toString());
        document.setRoot(toRoot(rootSelection));
        document.setServices(nodes.stream().map(node -> node.span().getServiceName()).toList());

        List<TraceDocumentWarningDTO> allWarnings = new ArrayList<>();
        if (warnings != null) {
            allWarnings.addAll(warnings);
        }
        allWarnings.addAll(derivedWarnings);
        document.setWarnings(normalizeWarnings(allWarnings));
        document.setSpans(nodes.stream().map(SpanNode::span).toList());
        return document;
    }

    /**
     * Normalizes a Trace ID to the v1 lowercase hexadecimal representation.
     *
     * @param traceId Trace ID
     * @return normalized Trace ID
     */
    public static String normalizeTraceId(String traceId) {
        if (traceId == null || !TRACE_ID_PATTERN.matcher(traceId).matches()) {
            throw new IllegalArgumentException("INVALID_TRACE_ID");
        }
        return traceId.toLowerCase(Locale.ROOT);
    }

    /**
     * Normalizes a Span ID to the v1 lowercase hexadecimal representation.
     *
     * @param spanId Span ID
     * @return normalized Span ID
     */
    public static String normalizeSpanId(String spanId) {
        if (spanId == null || !SPAN_ID_PATTERN.matcher(spanId).matches()) {
            throw new IllegalArgumentException("INVALID_SPAN_ID");
        }
        return spanId.toLowerCase(Locale.ROOT);
    }

    static Comparator<String> unicodeComparator() {
        return UNICODE_COMPARATOR;
    }

    static Map<String, String> sortedAttributes(Map<String, String> attributes) {
        Map<String, String> sorted = new TreeMap<>(UNICODE_COMPARATOR);
        if (attributes == null) {
            return sorted;
        }
        for (Map.Entry<String, String> attribute : attributes.entrySet()) {
            if (attribute.getKey() == null) {
                throw new IllegalArgumentException("INVALID_ATTRIBUTE_KEY");
            }
            sorted.put(attribute.getKey(), valueOrEmpty(attribute.getValue()));
        }
        return sorted;
    }

    public void setRoot(TraceDocumentRootDTO root) {
        this.root = root == null ? new TraceDocumentRootDTO() : root;
    }

    public void setServices(List<String> services) {
        Set<String> sorted = new TreeSet<>(UNICODE_COMPARATOR);
        if (services != null) {
            services.stream().map(TraceDocumentDTO::valueOrEmpty).forEach(sorted::add);
        }
        this.services = new ArrayList<>(sorted);
    }

    public void setWarnings(List<TraceDocumentWarningDTO> warnings) {
        this.warnings = warnings == null ? new ArrayList<>() : new ArrayList<>(warnings);
    }

    public void setSpans(List<TraceDocumentSpanDTO> spans) {
        this.spans = spans == null ? new ArrayList<>() : new ArrayList<>(spans);
    }

    private static List<SpanNode> normalizeSpans(String traceId, List<TraceDocumentSpanDTO> spans) {
        List<SpanNode> nodes = new ArrayList<>(spans.size());
        for (TraceDocumentSpanDTO span : spans) {
            if (span == null) {
                throw new IllegalArgumentException("INVALID_SPAN");
            }
            String spanTraceId = valueOrEmpty(span.getTraceId());
            if (!spanTraceId.isEmpty() && !traceId.equals(normalizeTraceId(spanTraceId))) {
                throw new IllegalArgumentException("TRACE_ID_MISMATCH");
            }
            span.setTraceId(traceId);
            span.setSpanId(normalizeSpanId(span.getSpanId()));
            String parentSpanId = valueOrEmpty(span.getParentSpanId());
            span.setParentSpanId(parentSpanId.isEmpty() ? "" : normalizeSpanId(parentSpanId));
            span.setTraceState(valueOrEmpty(span.getTraceState()));
            span.setServiceName(valueOrEmpty(span.getServiceName()));
            span.setName(valueOrEmpty(span.getName()));
            span.setKind(valueOrEmpty(span.getKind()));

            BigInteger start = parseUnsigned(span.getStartTimeUnixNano(),
                    "INVALID_START_TIME_UNIX_NANO");
            BigInteger duration = parseUnsigned(span.getDurationNano(), "INVALID_DURATION_NANO");
            span.setStartTimeUnixNano(start.toString());
            span.setDurationNano(duration.toString());

            normalizeStatus(span);
            span.setResourceAttributes(span.getResourceAttributes());
            normalizeScope(span);
            span.setSpanAttributes(span.getSpanAttributes());
            normalizeEvents(span);
            normalizeLinks(span);
            nodes.add(new SpanNode(span, start, duration));
        }
        return nodes;
    }

    private static void normalizeStatus(TraceDocumentSpanDTO span) {
        TraceDocumentStatusDTO status = span.getStatus();
        span.setStatus(status);
        span.getStatus().setCode(valueOrEmpty(span.getStatus().getCode()));
        span.getStatus().setMessage(valueOrEmpty(span.getStatus().getMessage()));
    }

    private static void normalizeScope(TraceDocumentSpanDTO span) {
        TraceDocumentScopeDTO scope = span.getScope();
        span.setScope(scope);
        span.getScope().setName(valueOrEmpty(span.getScope().getName()));
        span.getScope().setVersion(valueOrEmpty(span.getScope().getVersion()));
    }

    private static void normalizeEvents(TraceDocumentSpanDTO span) {
        List<TraceDocumentEventDTO> events = span.getEvents();
        span.setEvents(events);
        for (TraceDocumentEventDTO event : span.getEvents()) {
            if (event == null) {
                throw new IllegalArgumentException("INVALID_EVENT");
            }
            event.setTimeUnixNano(parseUnsigned(event.getTimeUnixNano(),
                    "INVALID_EVENT_TIME_UNIX_NANO").toString());
            event.setName(valueOrEmpty(event.getName()));
            event.setAttributes(event.getAttributes());
        }
    }

    private static void normalizeLinks(TraceDocumentSpanDTO span) {
        List<TraceDocumentLinkDTO> links = span.getLinks();
        span.setLinks(links);
        for (TraceDocumentLinkDTO link : span.getLinks()) {
            if (link == null) {
                throw new IllegalArgumentException("INVALID_LINK");
            }
            link.setTraceId(normalizeTraceId(link.getTraceId()));
            link.setSpanId(normalizeSpanId(link.getSpanId()));
            link.setTraceState(valueOrEmpty(link.getTraceState()));
            link.setAttributes(link.getAttributes());
        }
    }

    private static List<SpanNode> findCycleRepresentatives(List<SpanNode> nodes,
            Map<String, SpanNode> nodesById) {
        List<SpanNode> representatives = new ArrayList<>();
        Set<String> processed = new HashSet<>();
        for (SpanNode start : nodes) {
            if (processed.contains(start.span().getSpanId())) {
                continue;
            }
            List<SpanNode> path = new ArrayList<>();
            Map<String, Integer> pathIndexes = new HashMap<>();
            SpanNode current = start;
            while (current != null && !processed.contains(current.span().getSpanId())) {
                Integer cycleStart = pathIndexes.get(current.span().getSpanId());
                if (cycleStart != null) {
                    representatives.add(path.subList(cycleStart, path.size()).stream()
                            .min(SpanNode.ORDER).orElseThrow());
                    break;
                }
                pathIndexes.put(current.span().getSpanId(), path.size());
                path.add(current);
                current = nodesById.get(current.span().getParentSpanId());
            }
            path.stream().map(node -> node.span().getSpanId()).forEach(processed::add);
        }
        return representatives;
    }

    private static RootSelection selectRoot(List<SpanNode> naturalRoots,
            List<SpanNode> orphanRoots, List<SpanNode> cycleRoots) {
        if (!naturalRoots.isEmpty()) {
            return new RootSelection(naturalRoots.get(0), "natural");
        }
        if (!orphanRoots.isEmpty()) {
            return new RootSelection(orphanRoots.get(0), "orphan");
        }
        if (!cycleRoots.isEmpty()) {
            return new RootSelection(cycleRoots.get(0), "cycle");
        }
        throw new IllegalArgumentException("TRACE_HAS_NO_ROOT_CANDIDATE");
    }

    private static TraceDocumentRootDTO toRoot(RootSelection selection) {
        TraceDocumentRootDTO root = new TraceDocumentRootDTO();
        root.setSpanId(selection.node().span().getSpanId());
        root.setServiceName(selection.node().span().getServiceName());
        root.setName(selection.node().span().getName());
        root.setSelection(selection.selection());
        return root;
    }

    private static List<TraceDocumentWarningDTO> normalizeWarnings(
            List<TraceDocumentWarningDTO> warnings) {
        Set<TraceDocumentWarningDTO> normalized = new TreeSet<>(WARNING_COMPARATOR);
        for (TraceDocumentWarningDTO warning : warnings) {
            if (warning == null) {
                continue;
            }
            String spanId = valueOrEmpty(warning.getSpanId());
            normalized.add(warning(valueOrEmpty(warning.getCode()),
                    spanId.isEmpty() ? "" : normalizeSpanId(spanId),
                    truncateCodePoints(valueOrEmpty(warning.getMessage()))));
        }
        return new ArrayList<>(normalized);
    }

    private static TraceDocumentWarningDTO warning(String code, String spanId, String message) {
        TraceDocumentWarningDTO warning = new TraceDocumentWarningDTO();
        warning.setCode(code);
        warning.setSpanId(spanId);
        warning.setMessage(message);
        return warning;
    }

    private static BigInteger parseUnsigned(String value, String errorCode) {
        if (value == null || !UNSIGNED_DECIMAL_PATTERN.matcher(value).matches()) {
            throw new IllegalArgumentException(errorCode);
        }
        return new BigInteger(value);
    }

    private static String truncateCodePoints(String value) {
        int count = value.codePointCount(0, value.length());
        if (count <= MAX_WARNING_MESSAGE_CODE_POINTS) {
            return value;
        }
        return value.substring(0, value.offsetByCodePoints(0, MAX_WARNING_MESSAGE_CODE_POINTS));
    }

    private static String valueOrEmpty(String value) {
        return value == null ? "" : value;
    }

    private static int compareUnicode(String left, String right) {
        int leftOffset = 0;
        int rightOffset = 0;
        while (leftOffset < left.length() && rightOffset < right.length()) {
            int leftCodePoint = left.codePointAt(leftOffset);
            int rightCodePoint = right.codePointAt(rightOffset);
            int comparison = Integer.compare(leftCodePoint, rightCodePoint);
            if (comparison != 0) {
                return comparison;
            }
            leftOffset += Character.charCount(leftCodePoint);
            rightOffset += Character.charCount(rightCodePoint);
        }
        return Integer.compare(left.length() - leftOffset, right.length() - rightOffset);
    }

    private record SpanNode(TraceDocumentSpanDTO span, BigInteger start, BigInteger duration) {

        private static final Comparator<SpanNode> ORDER = Comparator.comparing(SpanNode::start)
                .thenComparing(node -> node.span().getSpanId(), UNICODE_COMPARATOR);
    }

    private record RootSelection(SpanNode node, String selection) {
    }
}
