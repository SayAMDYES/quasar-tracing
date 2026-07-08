package org.quasar.tracing.server.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.quasar.tracing.common.dto.LogRecordDTO;
import org.quasar.tracing.common.dto.OverviewKpisDTO;
import org.quasar.tracing.common.dto.OverviewPointDTO;
import org.quasar.tracing.common.dto.OverviewResponseDTO;
import org.quasar.tracing.core.service.OverviewService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Web-slice test for {@link OverviewController}: asserts the {@code /api/overview} envelope shape.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@WebMvcTest(OverviewController.class)
class OverviewControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private OverviewService overviewService;

    @Test
    void returnsOverviewEnvelope() throws Exception {
        OverviewKpisDTO kpis = new OverviewKpisDTO(1.5, 0.05, 8.5, 5, 1, 2, 1, 1);
        OverviewPointDTO point = new OverviewPointDTO(0L, 2.0, 0.2, 10.0, 9.0);
        LogRecordDTO error = new LogRecordDTO("0-0", 0L, "t", "s", "mysql", "ERROR", "boom", "production", "h1",
            "", "", "", "", "", Map.of());
        OverviewResponseDTO response = new OverviewResponseDTO(
            kpis, List.of(point), List.of(), List.of(), List.of(error));
        when(overviewService.overview(any(), any())).thenReturn(response);

        mvc.perform(get("/api/overview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200))
            .andExpect(jsonPath("$.data.kpis.serviceCount").value(2))
            .andExpect(jsonPath("$.data.kpis.degradedCount").value(1))
            .andExpect(jsonPath("$.data.kpis.unhealthyCount").value(1))
            .andExpect(jsonPath("$.data.series[0].time").value("0"))
            .andExpect(jsonPath("$.data.recentErrors[0].severity").value("ERROR"));
    }
}
