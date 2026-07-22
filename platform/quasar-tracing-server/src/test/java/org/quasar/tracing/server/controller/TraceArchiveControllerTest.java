package org.quasar.tracing.server.controller;

import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;

import org.junit.jupiter.api.Test;
import org.quasar.tracing.common.dto.ArchiveCapabilitiesDTO;
import org.quasar.tracing.common.dto.TraceArchiveResultDTO;
import org.quasar.tracing.common.dto.TraceArchiveStatusDTO;
import org.quasar.tracing.core.exception.ArchiveConflictException;
import org.quasar.tracing.core.exception.NotFoundException;
import org.quasar.tracing.core.service.TraceArchiveService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Web contract tests for Trace Archive capability and state transitions.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
@WebMvcTest(TraceArchiveController.class)
class TraceArchiveControllerTest {

    private static final String TRACE_ID = "00000000000000000000000000000001";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private TraceArchiveService service;

    @Test
    void exposesCapabilitiesEvenWhenArchiveIsDisabled() throws Exception {
        when(service.capabilities()).thenReturn(new ArchiveCapabilitiesDTO(false, 180, 20_000));

        mvc.perform(get("/api/archive/capabilities"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.enabled").value(false))
                .andExpect(jsonPath("$.data.retentionDays").value(180))
                .andExpect(jsonPath("$.data.maxSpansPerTrace").value(20_000));
    }

    @Test
    void returnsCreatedForFirstArchiveAndOkForIdempotentRepeat() throws Exception {
        TraceArchiveStatusDTO active = active();
        when(service.archive(TRACE_ID))
                .thenReturn(new TraceArchiveResultDTO(true, active))
                .thenReturn(new TraceArchiveResultDTO(false, active));

        mvc.perform(post("/api/traces/{traceId}/archive", TRACE_ID))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.created").value(true))
                .andExpect(jsonPath("$.data.archive.state").value("ACTIVE"));

        mvc.perform(post("/api/traces/{traceId}/archive", TRACE_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.created").value(false));
    }

    @Test
    void returnsStatusAndImmediateNoContentDeleteWithoutPollingState() throws Exception {
        when(service.status(TRACE_ID)).thenReturn(active());
        doNothing().when(service).delete(TRACE_ID);

        mvc.perform(get("/api/traces/{traceId}/archive-status", TRACE_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.archived").value(true))
                .andExpect(jsonPath("$.data.state").value("ACTIVE"))
                .andExpect(jsonPath("$.data.state").value(org.hamcrest.Matchers.not("DELETING")));

        mvc.perform(delete("/api/traces/{traceId}/archive", TRACE_ID))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
        verify(service).delete(TRACE_ID);
    }

    @Test
    void mapsDisabledAndVerificationFailureToStableHttpStatuses() throws Exception {
        when(service.archive(TRACE_ID))
                .thenThrow(new NotFoundException("TRACE_ARCHIVE_FEATURE_DISABLED"));
        doThrow(new ArchiveConflictException("ARCHIVE_VERIFICATION_FAILED"))
                .when(service).delete(TRACE_ID);

        mvc.perform(post("/api/traces/{traceId}/archive", TRACE_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("TRACE_ARCHIVE_FEATURE_DISABLED"));

        mvc.perform(delete("/api/traces/{traceId}/archive", TRACE_ID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(409))
                .andExpect(jsonPath("$.message").value("ARCHIVE_VERIFICATION_FAILED"));
    }

    private static TraceArchiveStatusDTO active() {
        return new TraceArchiveStatusDTO(true, "ACTIVE", TRACE_ID,
                "00000000-0000-0000-0000-000000000001", "1",
                1_775_000_000_000L, 1_790_000_000_000L, 1, "0".repeat(64));
    }
}
