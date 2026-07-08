package org.quasar.tracing.server.controller;

import java.util.Arrays;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.quasar.tracing.common.api.QTResponse;
import org.quasar.tracing.common.dto.LogSearchResultDTO;
import org.quasar.tracing.core.service.LogService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Log search: {@code GET /api/logs}. Parses the optional filters (severities as a CSV) and
 * delegates to {@link LogService}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class LogController {

    private final LogService logService;

    @GetMapping("/logs")
    public QTResponse<LogSearchResultDTO> search(
            @RequestParam(required = false) String service,
            @RequestParam(required = false) String traceId,
            @RequestParam(required = false) String spanId,
            @RequestParam(required = false) String environment,
            @RequestParam(required = false) String namespace,
            @RequestParam(required = false) String k8sNamespace,
            @RequestParam(required = false) String k8sPodName,
            @RequestParam(required = false) String k8sNodeName,
            @RequestParam(required = false) String serviceInstanceId,
            @RequestParam(required = false) String severities,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long from,
            @RequestParam(required = false) Long to,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Integer offset) {
        return QTResponse.ok(
            logService.search(service, traceId, spanId, environment, namespace, k8sNamespace, k8sPodName, k8sNodeName,
                serviceInstanceId, parseCsv(severities), q, from, to, limit, offset));
    }

    private static List<String> parseCsv(String csv) {
        if (csv == null || csv.isBlank()) {
            return List.of();
        }
        return Arrays.stream(csv.split(","))
            .map(String::trim)
            .filter(value -> !value.isEmpty())
            .toList();
    }
}
