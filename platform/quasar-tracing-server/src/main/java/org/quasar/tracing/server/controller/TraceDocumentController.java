package org.quasar.tracing.server.controller;

import org.quasar.tracing.common.api.QTResponse;
import org.quasar.tracing.common.dto.TraceDocumentDTO;
import org.quasar.tracing.common.dto.TraceSource;
import org.quasar.tracing.core.exception.InvalidQueryException;
import org.quasar.tracing.core.service.TraceDocumentService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read API for stable trace documents.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
@RestController
@RequestMapping("/api/traces")
@RequiredArgsConstructor
public class TraceDocumentController {

    private final TraceDocumentService traceDocumentService;

    @GetMapping("/{traceId}/document")
    public QTResponse<TraceDocumentDTO> document(
            @PathVariable String traceId,
            @RequestParam(defaultValue = "auto") String source) {
        return QTResponse.ok(traceDocumentService.get(traceId, parseSource(source)));
    }

    private static TraceSource parseSource(String source) {
        try {
            return TraceSource.fromValue(source);
        } catch (IllegalArgumentException exception) {
            throw new InvalidQueryException("INVALID_TRACE_SOURCE");
        }
    }
}
