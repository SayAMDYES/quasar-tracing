package org.quasar.tracing.core.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.quasar.tracing.clickhouse.entity.LogEntity;
import org.quasar.tracing.clickhouse.entity.LogHistogramSliceEntity;
import org.quasar.tracing.clickhouse.mapper.LogMapper;
import org.quasar.tracing.clickhouse.mapper.LogSearchFilter;
import org.quasar.tracing.common.api.QTPageDTO;
import org.quasar.tracing.common.dto.LogRecordDTO;
import org.quasar.tracing.common.dto.LogSearchResultDTO;
import org.quasar.tracing.common.util.TimeWindowUtil;
import org.quasar.tracing.core.config.QueryProperties;
import org.springframework.stereotype.Service;

/**
 * Log search: a filtered, paged read over the {@code logs} table plus a per-bucket severity
 * histogram pivoted for the chart (continuous buckets across the window, empty ones included).
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Service
@RequiredArgsConstructor
public class LogService {

    private static final String TIME_KEY = "time";

    private final LogMapper logMapper;
    private final QueryProperties query;

    public LogSearchResultDTO search(String service, String traceId, String spanId,
            String environment, String namespace, String k8sNamespace, String k8sPodName, String k8sNodeName, String serviceInstanceId,
            List<String> severities, String q,
            Long from, Long to, Integer limit, Integer offset) {
        Long toMs = TimeWindowUtil.resolveTo(to);
        Long fromMs = TimeWindowUtil.resolveFrom(from, toMs);
        Integer effectiveLimit = query.clamp(limit, query.defaultLogLimit());
        Integer effectiveOffset = offset == null ? 0 : Math.max(0, offset);
        Integer stepSec = TimeWindowUtil.stepSeconds(fromMs, toMs);

        LogSearchFilter filter = new LogSearchFilter(service, traceId, spanId,
            environment, namespace, k8sNamespace, k8sPodName, k8sNodeName, serviceInstanceId, severities, q,
            fromMs, toMs, effectiveLimit, effectiveOffset, stepSec);

        List<LogEntity> rows = logMapper.search(filter);
        List<LogRecordDTO> records = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            LogEntity e = rows.get(i);
            records.add(new LogRecordDTO(e.getTimestamp() + "-" + (effectiveOffset + i),
                e.getTimestamp(), e.getTraceId(), e.getSpanId(), e.getService(),
                e.getSeverity(), e.getBody(), e.getEnvironment(), e.getHost(),
                e.getServiceInstanceId(), e.getK8sNamespace(), e.getK8sPodName(),
                e.getK8sPodUid(), e.getK8sNodeName(), e.getResourceAttributes()));
        }
        Long total = logMapper.countSearch(filter);
        QTPageDTO<LogRecordDTO> page = QTPageDTO.of(records, total, effectiveLimit, effectiveOffset);

        List<Map<String, Object>> histogram = pivotHistogram(
            logMapper.histogram(filter), fromMs, toMs, TimeWindowUtil.stepMs(fromMs, toMs));

        return new LogSearchResultDTO(page, histogram);
    }

    /**
     * Pivots {time, severity, count} slices into one row per bucket — {@code {time, <SEV>: count, …}}
     * — across the whole window at {@code stepMs}, so empty buckets keep the chart axis continuous.
     */
    private static List<Map<String, Object>> pivotHistogram(List<LogHistogramSliceEntity> slices,
            Long fromMs, Long toMs, Long stepMs) {
        Map<Long, Map<String, Object>> countsByBucket = new LinkedHashMap<>();
        for (LogHistogramSliceEntity slice : slices) {
            countsByBucket.computeIfAbsent(slice.getTime(), k -> new LinkedHashMap<>())
                .put(slice.getSeverity(), slice.getCount());
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        long start = TimeWindowUtil.alignBucketStart(fromMs, stepMs);
        for (long bucket = start; bucket < toMs; bucket += stepMs) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put(TIME_KEY, bucket);
            Map<String, Object> counts = countsByBucket.get(bucket);
            if (counts != null) {
                row.putAll(counts);
            }
            rows.add(row);
        }
        return rows;
    }
}
