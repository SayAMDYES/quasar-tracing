package org.quasar.tracing.server.controller;

import lombok.RequiredArgsConstructor;
import org.quasar.tracing.common.api.QTResponse;
import org.quasar.tracing.common.dto.OverviewResponseDTO;
import org.quasar.tracing.core.service.OverviewService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Overview dashboard: {@code GET /api/overview}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class OverviewController {

    private final OverviewService overviewService;

    @GetMapping("/overview")
    public QTResponse<OverviewResponseDTO> overview(
            @RequestParam(required = false) Long from,
            @RequestParam(required = false) Long to) {
        return QTResponse.ok(overviewService.overview(from, to));
    }
}
