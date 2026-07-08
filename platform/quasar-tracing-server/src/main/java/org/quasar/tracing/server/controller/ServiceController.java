package org.quasar.tracing.server.controller;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.quasar.tracing.common.api.QTResponse;
import org.quasar.tracing.common.dto.DependencyGraphDTO;
import org.quasar.tracing.common.dto.ServiceDetailDTO;
import org.quasar.tracing.common.dto.ServiceStatDTO;
import org.quasar.tracing.core.service.ServiceMapService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Service-map endpoints: the enriched list ({@code GET /api/services}), the dependency graph
 * ({@code GET /api/services/dependencies}), and per-service detail
 * ({@code GET /api/services/{name}}). Spring matches {@code /dependencies} before {@code /{name}}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ServiceController {

    private final ServiceMapService serviceMapService;

    @GetMapping("/services")
    public QTResponse<List<ServiceStatDTO>> services(
            @RequestParam(required = false) Long from,
            @RequestParam(required = false) Long to) {
        return QTResponse.ok(serviceMapService.services(from, to));
    }

    @GetMapping("/services/dependencies")
    public QTResponse<DependencyGraphDTO> dependencies(
            @RequestParam(required = false) Long from,
            @RequestParam(required = false) Long to) {
        return QTResponse.ok(serviceMapService.dependencies(from, to));
    }

    @GetMapping("/services/{name}")
    public QTResponse<ServiceDetailDTO> detail(
            @PathVariable String name,
            @RequestParam(required = false) Long from,
            @RequestParam(required = false) Long to) {
        return QTResponse.ok(serviceMapService.detail(name, from, to));
    }
}
