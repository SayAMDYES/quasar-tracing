package org.quasar.tracing.server.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.quasar.tracing.common.dto.SpanDTO;
import org.quasar.tracing.common.dto.TraceDetailDTO;
import org.quasar.tracing.common.dto.TraceSummaryDTO;
import org.quasar.tracing.core.exception.NotFoundException;
import org.quasar.tracing.core.service.TraceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Web-slice tests for {@link TraceController} detail + the 404 envelope mapping.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@WebMvcTest(TraceController.class)
class TraceControllerDetailTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private TraceService traceService;

    @Test
    void returnsTraceDetailJson() throws Exception {
        TraceSummaryDTO summary = new TraceSummaryDTO("t1", "web-gateway", "GET /api/checkout",
            1000L, 120_000_000L, 2, 1, "Error", "production", "h1",
            "pod-uid-1", "quasar-ns", "web-gateway-abc", "pod-uid-1", "node-1", List.of("web-gateway", "mysql"));
        SpanDTO span = new SpanDTO("t1", "s1", "", "web-gateway", "GET /api/checkout", "Server",
            0d, 1000L, 120_000_000L, 120d, "Ok", "", 0, Map.of(), Map.of(), List.of());
        when(traceService.detail("t1"))
            .thenReturn(new TraceDetailDTO(summary, List.of(span), List.of("web-gateway", "mysql")));

        mvc.perform(get("/api/traces/t1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200))
            .andExpect(jsonPath("$.data.summary.services[0]").value("web-gateway"))
            .andExpect(jsonPath("$.data.spans.length()").value(1))
            .andExpect(jsonPath("$.data.spans[0].spanId").value("s1"));
    }

    @Test
    void returns404WithMessageForUnknownTrace() throws Exception {
        when(traceService.detail("missing")).thenThrow(new NotFoundException("Trace not found: missing"));

        mvc.perform(get("/api/traces/missing"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value(404))
            .andExpect(jsonPath("$.message").value("Trace not found: missing"));
    }
}
