package org.quasar.tracing.core.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.quasar.tracing.clickhouse.entity.LogEntity;
import org.quasar.tracing.clickhouse.entity.SpanEntity;
import org.quasar.tracing.clickhouse.entity.TraceSummaryEntity;
import org.quasar.tracing.clickhouse.mapper.LogMapper;
import org.quasar.tracing.clickhouse.mapper.SpanMapper;
import org.quasar.tracing.clickhouse.mapper.TraceMapper;
import org.quasar.tracing.clickhouse.mapper.TraceSearchFilter;
import org.quasar.tracing.common.api.QTPageDTO;
import org.quasar.tracing.common.dto.LogRecordDTO;
import org.quasar.tracing.common.dto.SpanDTO;
import org.quasar.tracing.common.dto.SpanEventDTO;
import org.quasar.tracing.common.dto.TraceAttributeConditionDTO;
import org.quasar.tracing.common.dto.TraceDetailDTO;
import org.quasar.tracing.common.dto.TraceSpanSelectorDTO;
import org.quasar.tracing.common.dto.TraceSummaryDTO;
import org.quasar.tracing.common.util.TimeWindowUtil;
import org.quasar.tracing.core.config.QueryProperties;
import org.quasar.tracing.core.exception.InvalidQueryException;
import org.quasar.tracing.core.exception.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Trace read paths: search (list view), full detail (spans with derived offsets / depth /
 * events), and the logs correlated to a trace. Resolves windows and paging, converts units,
 * and maps clickhouse row entities to the API DTOs.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Service
@RequiredArgsConstructor
public class TraceService {

    private static final double NANOS_PER_MILLI = 1_000_000.0;

    private final TraceMapper traceMapper;
    private final SpanMapper spanMapper;
    private final LogMapper logMapper;
    private final QueryProperties query;

    public QTPageDTO<TraceSummaryDTO> search(String service, String operation, String status, String environment,
            String namespace, String k8sNamespace, String k8sPodName, String k8sNodeName, String serviceInstanceId,
            Double minDurationMs, Double maxDurationMs, Long from, Long to, String q,
            List<TraceAttributeConditionDTO> attributeConditions,
            String spanService, String spanOperation, String spanStatus,
            String sort, String order, Integer limit, Integer offset) {
        TraceSpanSelectorDTO spanSelector = normalizeSpanSelector(spanService, spanOperation, spanStatus);
        Long toMs = TimeWindowUtil.resolveTo(to);
        Long fromMs = TimeWindowUtil.resolveFrom(from, toMs);
        Integer effectiveLimit = query.clamp(limit, query.defaultTraceLimit());
        Integer effectiveOffset = offset == null ? 0 : Math.max(0, offset);

        TraceSearchFilter filter = new TraceSearchFilter(
            service, operation, status == null ? "all" : status, environment,
            namespace, k8sNamespace, k8sPodName, k8sNodeName, serviceInstanceId,
            msToNs(minDurationMs), msToNs(maxDurationMs), fromMs, toMs, q,
            sort, order, effectiveLimit, effectiveOffset,
            attributeConditions == null ? List.of() : attributeConditions,
            spanSelector);

        List<TraceSummaryDTO> records = traceMapper.search(filter).stream()
            .map(TraceService::toSummaryDto)
            .toList();
        Long total = traceMapper.countSearch(filter);
        return QTPageDTO.of(records, total, effectiveLimit, effectiveOffset);
    }

    public TraceDetailDTO detail(String traceId) {
        List<SpanEntity> rows = spanMapper.selectByTraceId(traceId);
        if (rows.isEmpty()) {
            throw new NotFoundException("Trace not found: " + traceId);
        }

        SpanEntity root = rows.stream().min(Comparator.comparingLong(SpanEntity::getTimestamp)).orElseThrow();
        Long rootTs = root.getTimestamp();
        Map<String, SpanEntity> byId = rows.stream()
            .collect(Collectors.toMap(SpanEntity::getSpanId, s -> s, (a, b) -> a));

        List<SpanDTO> spans = rows.stream().map(s -> toSpanDto(s, rootTs, byId)).toList();
        List<String> services = rows.stream().map(SpanEntity::getServiceName).distinct().toList();
        int errorCount = (int) rows.stream().filter(s -> "Error".equals(s.getStatusCode())).count();
        TraceSummaryDTO summary = new TraceSummaryDTO(traceId, root.getServiceName(), root.getSpanName(),
            rootTs, root.getDuration(), rows.size(), errorCount,
            errorCount > 0 ? "Error" : "Ok", root.getEnvironment(), root.getHost(),
            root.getServiceInstanceId(), root.getK8sNamespace(), root.getK8sPodName(),
            root.getK8sPodUid(), root.getK8sNodeName(), services);
        return new TraceDetailDTO(summary, spans, services);
    }

    public List<LogRecordDTO> relatedLogs(String traceId) {
        if (spanMapper.selectByTraceId(traceId).isEmpty()) {
            throw new NotFoundException("Trace not found: " + traceId);
        }
        List<LogEntity> rows = logMapper.selectByTraceId(traceId);
        List<LogRecordDTO> logs = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            LogEntity e = rows.get(i);
            logs.add(new LogRecordDTO(traceId + "-" + i, e.getTimestamp(), e.getTraceId(), e.getSpanId(),
                e.getService(), e.getSeverity(), e.getBody(), e.getEnvironment(), e.getHost(),
                e.getServiceInstanceId(), e.getK8sNamespace(), e.getK8sPodName(),
                e.getK8sPodUid(), e.getK8sNodeName(), e.getResourceAttributes()));
        }
        return logs;
    }

    private static SpanDTO toSpanDto(SpanEntity e, Long rootTs, Map<String, SpanEntity> byId) {
        Double offsetMs = (double) (e.getTimestamp() - rootTs);
        Double durationMs = e.getDuration() / NANOS_PER_MILLI;
        return new SpanDTO(e.getTraceId(), e.getSpanId(), e.getParentSpanId(), e.getServiceName(),
            e.getSpanName(), e.getSpanKind(), offsetMs, e.getTimestamp(), e.getDuration(), durationMs,
            e.getStatusCode(), e.getStatusMessage(), depthOf(e, byId),
            e.getResourceAttributes(), e.getSpanAttributes(), zipEvents(e));
    }

    /** Walks the parent chain (cycle-guarded) to find the span's depth; root = 0. */
    private static Integer depthOf(SpanEntity span, Map<String, SpanEntity> byId) {
        int depth = 0;
        Set<String> seen = new HashSet<>();
        String parentId = span.getParentSpanId();
        while (parentId != null && !parentId.isEmpty() && byId.containsKey(parentId) && seen.add(parentId)) {
            depth++;
            parentId = byId.get(parentId).getParentSpanId();
        }
        return depth;
    }

    /** Zips the span's parallel event arrays into events; falls back to the span time when an event time is missing. */
    private static List<SpanEventDTO> zipEvents(SpanEntity e) {
        List<String> names = e.getEventNames();
        if (names == null || names.isEmpty()) {
            return List.of();
        }
        List<Long> times = e.getEventTimestamps();
        List<Map<String, String>> attributes = e.getEventAttributes();
        List<SpanEventDTO> events = new ArrayList<>(names.size());
        for (int i = 0; i < names.size(); i++) {
            Long timestamp = (times != null && i < times.size()) ? times.get(i) : e.getTimestamp();
            Map<String, String> attrs = (attributes != null && i < attributes.size()) ? attributes.get(i) : Map.of();
            events.add(new SpanEventDTO(names.get(i), timestamp, attrs));
        }
        return events;
    }

    private static Long msToNs(Double ms) {
        return ms == null ? null : (long) (ms * NANOS_PER_MILLI);
    }

    private static TraceSpanSelectorDTO normalizeSpanSelector(
            String service, String operation, String status) {
        String normalizedService = normalizeSelectorValue(service);
        String normalizedOperation = normalizeSelectorValue(operation);
        String normalizedStatus = normalizeSelectorValue(status);
        if (normalizedStatus != null) {
            normalizedStatus = normalizedStatus.toLowerCase(Locale.ROOT);
            if (!"error".equals(normalizedStatus) && !"ok".equals(normalizedStatus)) {
                throw new InvalidQueryException("Span status must be error or ok");
            }
        }
        if (normalizedService == null && normalizedOperation == null && normalizedStatus == null) {
            return null;
        }
        return new TraceSpanSelectorDTO(normalizedService, normalizedOperation, normalizedStatus);
    }

    private static String normalizeSelectorValue(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private static TraceSummaryDTO toSummaryDto(TraceSummaryEntity e) {
        return new TraceSummaryDTO(e.getTraceId(), e.getRootService(), e.getRootName(),
            e.getStartTime(), e.getDurationNs(), e.getSpanCount(), e.getErrorCount(),
            e.getStatus(), e.getEnvironment(), e.getHost(),
            e.getServiceInstanceId(), e.getK8sNamespace(), e.getK8sPodName(),
            e.getK8sPodUid(), e.getK8sNodeName(), null);
    }
}
