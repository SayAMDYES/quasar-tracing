package org.quasar.tracing.server.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.quasar.tracing.common.dto.DependencyGraphDTO;
import org.quasar.tracing.common.dto.EndpointRedDTO;
import org.quasar.tracing.common.dto.ServiceDetailDTO;
import org.quasar.tracing.common.dto.ServiceEdgeDTO;
import org.quasar.tracing.common.dto.ServiceNodeDTO;
import org.quasar.tracing.common.dto.ServiceStatDTO;
import org.quasar.tracing.core.exception.NotFoundException;
import org.quasar.tracing.core.service.ServiceMapService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Web-slice tests for {@link ServiceController}: list, dependency graph, detail, and the 404.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@WebMvcTest(ServiceController.class)
class ServiceControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ServiceMapService serviceMapService;

    @Test
    void returnsServiceList() throws Exception {
        ServiceStatDTO stat = new ServiceStatDTO("mysql", "datastore", "Go",
            100L, 0.1, 2_000_000.0, 1_000_000.0, 5_000_000.0, 9_000_000.0, 1, 0);
        when(serviceMapService.services(any(), any())).thenReturn(List.of(stat));

        mvc.perform(get("/api/services"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200))
            .andExpect(jsonPath("$.data[0].name").value("mysql"))
            .andExpect(jsonPath("$.data[0].type").value("datastore"))
            .andExpect(jsonPath("$.data[0].tech").value("Go"))
            .andExpect(jsonPath("$.data[0].upstreams").value(1));
    }

    @Test
    void returnsDependencyGraph() throws Exception {
        ServiceNodeDTO node = new ServiceNodeDTO("mysql", "datastore", "Go", 100L, 0.1, 2_000_000.0);
        ServiceEdgeDTO edge = new ServiceEdgeDTO("web-gateway", "mysql", 5L, 0L, 0.0, 2_000_000.0, List.of("SELECT"));
        when(serviceMapService.dependencies(any(), any()))
            .thenReturn(new DependencyGraphDTO(List.of(node), List.of(edge)));

        mvc.perform(get("/api/services/dependencies"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.nodes[0].name").value("mysql"))
            .andExpect(jsonPath("$.data.nodes[0].tech").value("Go"))
            .andExpect(jsonPath("$.data.edges[0].caller").value("web-gateway"))
            .andExpect(jsonPath("$.data.edges[0].operations[0]").value("SELECT"));
    }

    @Test
    void returnsServiceDetail() throws Exception {
        EndpointRedDTO endpoint = new EndpointRedDTO("SELECT", 10L, 10.0, 0.2, 1.0, 5.0, 9.0);
        ServiceEdgeDTO upstream = new ServiceEdgeDTO("web-gateway", "mysql", 5L, 0L, 0.0, 2_000_000.0, List.of("SELECT"));
        ServiceDetailDTO detail = new ServiceDetailDTO("mysql", "datastore", "Go",
            100L, 0.1, 2_000_000.0, 1_000_000.0, 5_000_000.0, 9_000_000.0,
            List.of(endpoint), List.of(upstream), List.of());
        when(serviceMapService.detail(any(), any(), any())).thenReturn(detail);

        mvc.perform(get("/api/services/mysql"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.name").value("mysql"))
            .andExpect(jsonPath("$.data.tech").value("Go"))
            .andExpect(jsonPath("$.data.endpoints[0].operation").value("SELECT"))
            .andExpect(jsonPath("$.data.upstreams[0].caller").value("web-gateway"));
    }

    @Test
    void returns404ForUnknownService() throws Exception {
        when(serviceMapService.detail(any(), any(), any()))
            .thenThrow(new NotFoundException("Service not found: ghost"));

        mvc.perform(get("/api/services/ghost"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value(404))
            .andExpect(jsonPath("$.message").value("Service not found: ghost"));
    }
}
