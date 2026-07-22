package org.quasar.tracing.server.controller;

import org.quasar.tracing.common.api.QTResponse;
import org.quasar.tracing.common.dto.ArchiveCapabilitiesDTO;
import org.quasar.tracing.common.dto.TraceArchiveResultDTO;
import org.quasar.tracing.common.dto.TraceArchiveStatusDTO;
import org.quasar.tracing.core.service.TraceArchiveService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Trace Archive capability, state, creation and logical deletion endpoints.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class TraceArchiveController {

    private final TraceArchiveService traceArchiveService;

    @GetMapping("/archive/capabilities")
    public QTResponse<ArchiveCapabilitiesDTO> capabilities() {
        return QTResponse.ok(traceArchiveService.capabilities());
    }

    @PostMapping("/traces/{traceId}/archive")
    public ResponseEntity<QTResponse<TraceArchiveResultDTO>> archive(@PathVariable String traceId) {
        TraceArchiveResultDTO result = traceArchiveService.archive(traceId);
        HttpStatus status = Boolean.TRUE.equals(result.getCreated()) ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(QTResponse.ok(result));
    }

    @GetMapping("/traces/{traceId}/archive-status")
    public QTResponse<TraceArchiveStatusDTO> status(@PathVariable String traceId) {
        return QTResponse.ok(traceArchiveService.status(traceId));
    }

    @DeleteMapping("/traces/{traceId}/archive")
    public ResponseEntity<Void> delete(@PathVariable String traceId) {
        traceArchiveService.delete(traceId);
        return ResponseEntity.noContent().build();
    }
}
