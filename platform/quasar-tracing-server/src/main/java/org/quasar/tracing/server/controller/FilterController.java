package org.quasar.tracing.server.controller;

import org.quasar.tracing.common.api.QTResponse;
import org.quasar.tracing.common.dto.FiltersResponseDTO;
import org.quasar.tracing.core.service.FilterService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Serves the faceted-search options for the UI: {@code GET /api/filters}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class FilterController {

    private final FilterService service;

    @GetMapping("/filters")
    public QTResponse<FiltersResponseDTO> filters() {
        return QTResponse.ok(service.filters());
    }
}
