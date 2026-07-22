package org.quasar.tracing.core.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Arrays;
import org.quasar.tracing.clickhouse.entity.TraceArchiveManifestEntity;
import org.quasar.tracing.clickhouse.entity.SpanEntity;
import org.quasar.tracing.clickhouse.mapper.SpanMapper;
import org.quasar.tracing.clickhouse.mapper.TraceArchiveMapper;
import org.quasar.tracing.common.dto.TraceDocumentDTO;
import org.quasar.tracing.common.dto.TraceDocumentEventDTO;
import org.quasar.tracing.common.dto.TraceDocumentLinkDTO;
import org.quasar.tracing.common.dto.TraceDocumentScopeDTO;
import org.quasar.tracing.common.dto.TraceDocumentSpanDTO;
import org.quasar.tracing.common.dto.TraceDocumentStatusDTO;
import org.quasar.tracing.common.dto.TraceSource;
import org.quasar.tracing.common.json.TraceDocumentPrettyPrinter;
import org.quasar.tracing.core.exception.InvalidQueryException;
import org.quasar.tracing.core.exception.NotFoundException;
import org.quasar.tracing.core.exception.TraceDocumentTooLargeException;
import org.quasar.tracing.core.config.ArchiveProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Builds the stable v1 trace document from stored live Span rows.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
@Service
public class TraceDocumentService {

    private static final int MAX_SPANS = 20_000;

    private static final long MAX_DOCUMENT_BYTES = 50L * 1024 * 1024;

    private final SpanMapper spanMapper;

    private final TraceArchiveMapper traceArchiveMapper;

    private final ArchiveProperties archiveProperties;

    private final ObjectWriter canonicalWriter;

    private final int maxSpans;

    private final long maxDocumentBytes;

    @Autowired
    public TraceDocumentService(SpanMapper spanMapper, TraceArchiveMapper traceArchiveMapper,
            ArchiveProperties archiveProperties, ObjectMapper objectMapper) {
        this(spanMapper, traceArchiveMapper, archiveProperties,
                objectMapper, MAX_SPANS, MAX_DOCUMENT_BYTES);
    }

    TraceDocumentService(SpanMapper spanMapper, ObjectMapper objectMapper) {
        this(spanMapper, null, new ArchiveProperties(false, null, null),
                objectMapper, MAX_SPANS, MAX_DOCUMENT_BYTES);
    }

    TraceDocumentService(SpanMapper spanMapper, ObjectMapper objectMapper,
            int maxSpans, long maxDocumentBytes) {
        this(spanMapper, null, new ArchiveProperties(false, null, null),
                objectMapper, maxSpans, maxDocumentBytes);
    }

    TraceDocumentService(SpanMapper spanMapper, TraceArchiveMapper traceArchiveMapper,
            ArchiveProperties archiveProperties, ObjectMapper objectMapper,
            int maxSpans, long maxDocumentBytes) {
        this.spanMapper = spanMapper;
        this.traceArchiveMapper = traceArchiveMapper;
        this.archiveProperties = archiveProperties;
        this.canonicalWriter = canonicalWriter(objectMapper);
        this.maxSpans = maxSpans;
        this.maxDocumentBytes = maxDocumentBytes;
    }

    public TraceDocumentDTO get(String traceId, TraceSource source) {
        String normalizedTraceId = normalizeTraceId(traceId);
        if (source == null) {
            throw new InvalidQueryException("INVALID_TRACE_SOURCE");
        }
        if (source == TraceSource.ARCHIVE) {
            return archiveDocument(normalizedTraceId);
        }

        List<SpanEntity> rows = spanMapper.selectByTraceId(normalizedTraceId);
        if (rows != null && !rows.isEmpty()) {
            return toDocument(normalizedTraceId, rows);
        }
        if (source == TraceSource.AUTO && archiveProperties.isEnabled()) {
            return archiveDocument(normalizedTraceId);
        }
        throw new NotFoundException("Trace not found: " + normalizedTraceId);
    }

    private TraceDocumentDTO archiveDocument(String traceId) {
        if (!archiveProperties.isEnabled() || traceArchiveMapper == null) {
            throw new NotFoundException("TRACE_ARCHIVE_FEATURE_DISABLED");
        }
        TraceArchiveManifestEntity latest = traceArchiveMapper.selectLatest(traceId);
        if (latest == null || !"ACTIVE".equals(latest.getState())
                || latest.getExpiresAt() == null || latest.getExpiresAt() <= System.currentTimeMillis()) {
            throw new NotFoundException("Trace not found: " + traceId);
        }
        List<SpanEntity> rows = traceArchiveMapper.selectGeneration(traceId, latest.getGeneration());
        if (rows == null || rows.isEmpty()) {
            throw new NotFoundException("Trace not found: " + traceId);
        }
        return toDocument(traceId, rows);
    }

    TraceDocumentDTO toDocument(String traceId, List<SpanEntity> rows) {
        if (rows.size() > maxSpans) {
            throw new TraceDocumentTooLargeException();
        }

        List<TraceDocumentSpanDTO> spans = new ArrayList<>(rows.size());
        for (SpanEntity row : rows) {
            row.validateDocumentArrays();
            spans.add(toSpan(row));
        }

        TraceDocumentDTO document = TraceDocumentDTO.canonicalize(traceId, spans);
        verifyDocumentSize(document);
        return document;
    }

    private static String normalizeTraceId(String traceId) {
        try {
            return TraceDocumentDTO.normalizeTraceId(traceId);
        } catch (IllegalArgumentException exception) {
            throw new InvalidQueryException("INVALID_TRACE_ID");
        }
    }

    private static TraceDocumentSpanDTO toSpan(SpanEntity row) {
        TraceDocumentSpanDTO span = new TraceDocumentSpanDTO();
        span.setTraceId(row.getTraceId());
        span.setSpanId(row.getSpanId());
        span.setParentSpanId(row.getParentSpanId());
        span.setTraceState(row.getTraceState());
        span.setServiceName(row.getServiceName());
        span.setName(row.getSpanName());
        span.setKind(row.getSpanKind());
        span.setStartTimeUnixNano(row.getStartTimeUnixNano());
        span.setDurationNano(row.getDurationNano());

        TraceDocumentStatusDTO status = new TraceDocumentStatusDTO();
        status.setCode(row.getStatusCode());
        status.setMessage(row.getStatusMessage());
        span.setStatus(status);
        span.setResourceAttributes(copyMap(row.getResourceAttributes()));

        TraceDocumentScopeDTO scope = new TraceDocumentScopeDTO();
        scope.setName(row.getScopeName());
        scope.setVersion(row.getScopeVersion());
        span.setScope(scope);
        span.setSpanAttributes(copyMap(row.getSpanAttributes()));
        span.setEvents(toEvents(row));
        span.setLinks(toLinks(row));
        return span;
    }

    private static List<TraceDocumentEventDTO> toEvents(SpanEntity row) {
        List<String> names = listOrEmpty(row.getEventNames());
        List<String> times = listOrEmpty(row.getEventTimeUnixNanos());
        List<Map<String, String>> attributes = listOrEmpty(row.getEventAttributes());
        List<TraceDocumentEventDTO> events = new ArrayList<>(names.size());
        for (int index = 0; index < names.size(); index++) {
            TraceDocumentEventDTO event = new TraceDocumentEventDTO();
            event.setName(names.get(index));
            event.setTimeUnixNano(times.get(index));
            event.setAttributes(copyMap(attributes.get(index)));
            events.add(event);
        }
        return events;
    }

    private static List<TraceDocumentLinkDTO> toLinks(SpanEntity row) {
        List<String> traceIds = listOrEmpty(row.getLinkTraceIds());
        List<String> spanIds = listOrEmpty(row.getLinkSpanIds());
        List<String> traceStates = listOrEmpty(row.getLinkTraceStates());
        List<Map<String, String>> attributes = listOrEmpty(row.getLinkAttributes());
        List<TraceDocumentLinkDTO> links = new ArrayList<>(traceIds.size());
        for (int index = 0; index < traceIds.size(); index++) {
            TraceDocumentLinkDTO link = new TraceDocumentLinkDTO();
            link.setTraceId(traceIds.get(index));
            link.setSpanId(spanIds.get(index));
            link.setTraceState(traceStates.get(index));
            link.setAttributes(copyMap(attributes.get(index)));
            links.add(link);
        }
        return links;
    }

    private void verifyDocumentSize(TraceDocumentDTO document) {
        if (canonicalBytes(document).length > maxDocumentBytes) {
            throw new TraceDocumentTooLargeException();
        }
    }

    byte[] canonicalBytes(TraceDocumentDTO document) {
        try {
            byte[] json = canonicalWriter.writeValueAsBytes(document);
            byte[] canonical = Arrays.copyOf(json, json.length + 1);
            canonical[canonical.length - 1] = '\n';
            return canonical;
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("TRACE_DOCUMENT_SERIALIZATION_FAILED", exception);
        }
    }

    private static ObjectWriter canonicalWriter(ObjectMapper objectMapper) {
        return objectMapper.writer(new TraceDocumentPrettyPrinter());
    }

    private static Map<String, String> copyMap(Map<String, String> values) {
        return values == null ? Map.of() : new HashMap<>(values);
    }

    private static <T> List<T> listOrEmpty(List<T> values) {
        return values == null ? List.of() : values;
    }
}
