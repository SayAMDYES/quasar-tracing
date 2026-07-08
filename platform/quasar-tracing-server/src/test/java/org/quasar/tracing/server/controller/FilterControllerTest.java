package org.quasar.tracing.server.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.quasar.tracing.common.dto.FiltersResponseDTO;
import org.quasar.tracing.common.dto.ServiceRefDTO;
import org.quasar.tracing.core.service.FilterService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Web-slice test for {@link FilterController}: asserts the {@code /api/filters} envelope shape.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@WebMvcTest(FilterController.class)
class FilterControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private FilterService service;

    @Test
    void returnsFiltersJson() throws Exception {
        when(service.filters()).thenReturn(new FiltersResponseDTO(
            List.of(new ServiceRefDTO("web-gateway", "app")), List.of("web-gateway"),
            List.of("GET /x"), List.of("production"), List.of("quasar-ns"), List.of("quasar-ns"),
            List.of("web-gateway-abc"), List.of("node-1"), List.of("pod-uid-1"), List.of("INFO")));

        mvc.perform(get("/api/filters"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200))
            .andExpect(jsonPath("$.data.services[0].name").value("web-gateway"))
            .andExpect(jsonPath("$.data.services[0].type").value("app"))
            .andExpect(jsonPath("$.data.appServices[0]").value("web-gateway"))
            .andExpect(jsonPath("$.data.environments[0]").value("production"))
            .andExpect(jsonPath("$.data.namespaces[0]").value("quasar-ns"))
            .andExpect(jsonPath("$.data.k8sNamespaces[0]").value("quasar-ns"))
            .andExpect(jsonPath("$.data.serviceInstances[0]").value("pod-uid-1"))
            .andExpect(jsonPath("$.data.severities[0]").value("INFO"));
    }
}
