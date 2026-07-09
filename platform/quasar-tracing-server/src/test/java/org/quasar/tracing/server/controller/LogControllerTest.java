package org.quasar.tracing.server.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.quasar.tracing.common.api.QTPageDTO;
import org.quasar.tracing.common.dto.LogRecordDTO;
import org.quasar.tracing.common.dto.LogSearchResultDTO;
import org.quasar.tracing.core.service.LogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Web-slice test for {@link LogController}: asserts the {@code /api/logs} envelope, page, and
 * histogram shape.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@WebMvcTest(LogController.class)
class LogControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private LogService logService;

    @Test
    void returnsLogsEnvelope() throws Exception {
        LogRecordDTO log = new LogRecordDTO("30000-0", 30_000L, "t", "s", "mysql",
            "ERROR", "deadlock", "production", "h1", "pod-uid-1", "quasar-ns",
            "mysql-0", "pod-uid-1", "node-1", Map.of("k8s.pod.name", "mysql-0"));
        QTPageDTO<LogRecordDTO> page = new QTPageDTO<>(1, 100, 1L, List.of(log));
        Map<String, Object> bucket = new LinkedHashMap<>();
        bucket.put("time", 0L);
        bucket.put("ERROR", 1L);
        when(logService.search(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(new LogSearchResultDTO(page, List.of(bucket)));

        mvc.perform(get("/api/logs")
                .param("traceId", "t")
                .param("spanId", "s")
                .param("severities", "ERROR")
                .param("environment", "production")
                .param("namespace", "quasar")
                .param("serviceInstanceId", "pod-uid-1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200))
            .andExpect(jsonPath("$.data.page.total").value("1"))
            .andExpect(jsonPath("$.data.page.records[0].severity").value("ERROR"))
            .andExpect(jsonPath("$.data.page.records[0].environment").value("production"))
            .andExpect(jsonPath("$.data.page.records[0].serviceInstanceId").value("pod-uid-1"))
            .andExpect(jsonPath("$.data.page.records[0].k8sPodName").value("mysql-0"))
            .andExpect(jsonPath("$.data.histogram[0].ERROR").value(1));
        verify(logService).search(any(), eq("t"), eq("s"), eq("production"), eq("quasar"), any(), any(), any(),
            eq("pod-uid-1"), any(), any(), any(), any(), any(), any());
    }

    @Test
    void opensLogStream() throws Exception {
        when(logService.stream(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(List.of());

        mvc.perform(get("/api/logs/stream")
                .param("service", "mysql")
                .param("severities", "ERROR")
                .param("cursor", "30000"))
            .andExpect(status().isOk())
            .andExpect(request().asyncStarted())
            .andExpect(header().string("Content-Type", Matchers.containsString("text/event-stream")));

        verify(logService).stream(eq("mysql"), any(), any(), any(), any(), any(), any(), any(), any(), eq(List.of("ERROR")),
            any(), eq(30_000L), any());
    }
}
