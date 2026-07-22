package org.quasar.tracing.server.controller;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.quasar.tracing.common.dto.TraceDocumentDTO;
import org.quasar.tracing.common.dto.TraceSource;
import org.quasar.tracing.core.exception.NotFoundException;
import org.quasar.tracing.core.exception.TraceDocumentTooLargeException;
import org.quasar.tracing.core.service.TraceDocumentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Web-slice tests for the trace document read API.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
@WebMvcTest(TraceDocumentController.class)
class TraceDocumentControllerTest {

    private static final String TRACE_ID = "00000000000000000000000000000001";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private TraceDocumentService service;

    @Test
    void defaultsSourceToAuto() throws Exception {
        TraceDocumentDTO document = document();
        when(service.get(TRACE_ID, TraceSource.AUTO)).thenReturn(document);

        mvc.perform(get("/api/traces/{traceId}/document", TRACE_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.traceId").value(TRACE_ID));

        verify(service).get(TRACE_ID, TraceSource.AUTO);
    }

    @Test
    void acceptsExplicitLiveCaseInsensitively() throws Exception {
        when(service.get(TRACE_ID, TraceSource.LIVE)).thenReturn(document());

        mvc.perform(get("/api/traces/{traceId}/document", TRACE_ID).param("source", "LiVe"))
                .andExpect(status().isOk());

        verify(service).get(TRACE_ID, TraceSource.LIVE);
    }

    @Test
    void returnsBadRequestForInvalidSource() throws Exception {
        mvc.perform(get("/api/traces/{traceId}/document", TRACE_ID).param("source", "remote"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.message").value("INVALID_TRACE_SOURCE"));
    }

    @Test
    void returns404ForMissingAndDisabledArchive() throws Exception {
        when(service.get(TRACE_ID, TraceSource.LIVE))
                .thenThrow(new NotFoundException("Trace not found: " + TRACE_ID));
        when(service.get(TRACE_ID, TraceSource.ARCHIVE))
                .thenThrow(new NotFoundException("TRACE_ARCHIVE_FEATURE_DISABLED"));

        mvc.perform(get("/api/traces/{traceId}/document", TRACE_ID).param("source", "live"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Trace not found: " + TRACE_ID));

        mvc.perform(get("/api/traces/{traceId}/document", TRACE_ID).param("source", "archive"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("TRACE_ARCHIVE_FEATURE_DISABLED"));
    }

    @Test
    void returns413WithStableIdentifier() throws Exception {
        when(service.get(TRACE_ID, TraceSource.LIVE))
                .thenThrow(new TraceDocumentTooLargeException());

        mvc.perform(get("/api/traces/{traceId}/document", TRACE_ID).param("source", "live"))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.code").value(413))
                .andExpect(jsonPath("$.message")
                        .value(TraceDocumentTooLargeException.ERROR_IDENTIFIER));
    }

    private static TraceDocumentDTO document() {
        TraceDocumentDTO document = new TraceDocumentDTO();
        document.setTraceId(TRACE_ID);
        return document;
    }
}
