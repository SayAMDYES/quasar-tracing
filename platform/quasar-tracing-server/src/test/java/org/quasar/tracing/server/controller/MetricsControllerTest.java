package org.quasar.tracing.server.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import org.quasar.tracing.common.dto.JvmMetricsDTO;
import org.junit.jupiter.api.Test;
import org.quasar.tracing.common.dto.MetricInstanceDTO;
import org.quasar.tracing.common.dto.MetricPointDTO;
import org.quasar.tracing.common.dto.MetricsResponseDTO;
import org.quasar.tracing.common.dto.MetricsSummaryDTO;
import org.quasar.tracing.core.service.MetricsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Web-slice test for {@link MetricsController}: asserts the {@code /api/metrics} envelope shape.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@WebMvcTest(MetricsController.class)
class MetricsControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private MetricsService metricsService;

    @Test
    void returnsMetricsEnvelope() throws Exception {
        MetricPointDTO point = new MetricPointDTO(0L, 2.0, 0.2, 10.0, 1.0, 5.0, 9.0);
        MetricsSummaryDTO summary = new MetricsSummaryDTO(1.5, 0.05, 1.5, 4.5, 8.5, point);
        JvmMetricsDTO jvm = new JvmMetricsDTO(128.0, 512.0, 0.25, 48.0, 12.0);
        MetricInstanceDTO instance = new MetricInstanceDTO("pod-uid-1", "pod", "web-gateway-abc",
            120L, 2.0, 0.1, 9.0, Map.of("k8s.pod.name", "web-gateway-abc"));
        MetricsResponseDTO response = new MetricsResponseDTO("web-gateway", 60_000L,
            List.of(point), List.of(), List.of(instance), jvm, summary);
        when(metricsService.metrics(any(), any(), any(), any(), any(), any())).thenReturn(response);

        mvc.perform(get("/api/metrics")
                .param("service", "web-gateway")
                .param("environment", "production")
                .param("namespace", "quasar")
                .param("serviceInstanceId", "pod-uid-1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200))
            .andExpect(jsonPath("$.data.service").value("web-gateway"))
            .andExpect(jsonPath("$.data.step").value("60000"))
            .andExpect(jsonPath("$.data.series[0].time").value("0"))
            .andExpect(jsonPath("$.data.instances[0].serviceInstanceId").value("pod-uid-1"))
            .andExpect(jsonPath("$.data.jvm.heapUsed").value(128.0))
            .andExpect(jsonPath("$.data.summary.current.time").value("0"));
        verify(metricsService).metrics(eq("web-gateway"), eq("production"), eq("quasar"),
            eq("pod-uid-1"), any(), any());
    }
}
