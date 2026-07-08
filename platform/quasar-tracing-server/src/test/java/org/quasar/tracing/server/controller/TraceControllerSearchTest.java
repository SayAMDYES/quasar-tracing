package org.quasar.tracing.server.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.quasar.tracing.common.api.QTPageDTO;
import org.quasar.tracing.common.dto.TraceSummaryDTO;
import org.quasar.tracing.core.service.TraceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Web-slice test for {@link TraceController#search}: asserts the {@code /api/traces} envelope
 * + page shape.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@WebMvcTest(TraceController.class)
class TraceControllerSearchTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private TraceService service;

    @Test
    void returnsTraceSearchJson() throws Exception {
        TraceSummaryDTO trace = new TraceSummaryDTO("aabbccddeeff00112233445566778899", "web-gateway",
            "GET /api/checkout", 1_717_840_800_000L, 120_000_000L, 18, 1, "Error", "production",
            "ip-10-2-14-3", "pod-uid-1", "quasar-ns", "web-gateway-abc", "pod-uid-1", "node-1", null);
        when(service.search(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(new QTPageDTO<>(1, 50, 150L, List.of(trace)));

        mvc.perform(get("/api/traces")
                .param("environment", "production")
                .param("namespace", "quasar")
                .param("serviceInstanceId", "pod-uid-1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200))
            .andExpect(jsonPath("$.data.total").value("150"))
            .andExpect(jsonPath("$.data.current").value(1))
            .andExpect(jsonPath("$.data.size").value(50))
            .andExpect(jsonPath("$.data.records[0].traceId").value("aabbccddeeff00112233445566778899"))
            .andExpect(jsonPath("$.data.records[0].status").value("Error"))
            .andExpect(jsonPath("$.data.records[0].environment").value("production"))
            .andExpect(jsonPath("$.data.records[0].serviceInstanceId").value("pod-uid-1"))
            .andExpect(jsonPath("$.data.records[0].k8sNamespace").value("quasar-ns"))
            .andExpect(jsonPath("$.data.records[0].durationNs").value("120000000"));
        verify(service).search(any(), any(), any(), eq("production"), eq("quasar"), any(), any(), any(),
            eq("pod-uid-1"), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }
}
