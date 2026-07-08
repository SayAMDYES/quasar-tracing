package org.quasar.tracing.server.controller;

import java.util.List;
import org.quasar.tracing.common.api.QTPageDTO;
import org.quasar.tracing.common.api.QTResponse;
import org.quasar.tracing.common.dto.LogRecordDTO;
import org.quasar.tracing.common.dto.TraceDetailDTO;
import org.quasar.tracing.common.dto.TraceSummaryDTO;
import org.quasar.tracing.core.service.TraceService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Trace read endpoints: search ({@code GET /api/traces}), detail
 * ({@code GET /api/traces/{id}}), and related logs ({@code GET /api/traces/{id}/logs}).
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class TraceController {

    private final TraceService traceService;

    @GetMapping("/traces")
    public QTResponse<QTPageDTO<TraceSummaryDTO>> search(
            @RequestParam(required = false) String service,
            @RequestParam(required = false) String operation,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String environment,
            @RequestParam(required = false) String namespace,
            @RequestParam(required = false) String k8sNamespace,
            @RequestParam(required = false) String k8sPodName,
            @RequestParam(required = false) String k8sNodeName,
            @RequestParam(required = false) String serviceInstanceId,
            @RequestParam(required = false) Double minDurationMs,
            @RequestParam(required = false) Double maxDurationMs,
            @RequestParam(required = false) Long from,
            @RequestParam(required = false) Long to,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String order,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Integer offset) {
        return QTResponse.ok(traceService.search(service, operation, status, environment,
            namespace, k8sNamespace, k8sPodName, k8sNodeName, serviceInstanceId,
            minDurationMs, maxDurationMs, from, to, q, sort, order, limit, offset));
    }

    @GetMapping("/traces/{traceId}")
    public QTResponse<TraceDetailDTO> detail(@PathVariable String traceId) {
        return QTResponse.ok(traceService.detail(traceId));
    }

    @GetMapping("/traces/{traceId}/logs")
    public QTResponse<List<LogRecordDTO>> relatedLogs(@PathVariable String traceId) {
        return QTResponse.ok(traceService.relatedLogs(traceId));
    }
}
