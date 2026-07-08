package org.quasar.tracing.server.controller;

import lombok.RequiredArgsConstructor;
import org.quasar.tracing.common.api.QTResponse;
import org.quasar.tracing.common.dto.MetricsResponseDTO;
import org.quasar.tracing.core.service.MetricsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Per-service RED metrics: {@code GET /api/metrics}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class MetricsController {

    private final MetricsService metricsService;

    @GetMapping("/metrics")
    public QTResponse<MetricsResponseDTO> metrics(
            @RequestParam String service,
            @RequestParam(required = false) String environment,
            @RequestParam(required = false) String namespace,
            @RequestParam(required = false) String serviceInstanceId,
            @RequestParam(required = false) Long from,
            @RequestParam(required = false) Long to) {
        return QTResponse.ok(metricsService.metrics(service, environment, namespace, serviceInstanceId, from, to));
    }
}
