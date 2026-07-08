package org.quasar.tracing.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.quasar.tracing.clickhouse.mapper.MetaMapper;
import org.quasar.tracing.common.dto.FiltersResponseDTO;
import org.quasar.tracing.core.classify.ServiceClassifier;
import org.quasar.tracing.core.config.ServiceTypeProperties;

/**
 * Unit tests for {@link FilterService} with a mocked {@link MetaMapper}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
class FilterServiceTest {

    private final MetaMapper meta = Mockito.mock(MetaMapper.class);
    private final FilterService service = new FilterService(meta,
        new ServiceClassifier(new ServiceTypeProperties(Map.of("mysql", "datastore"))));

    @Test
    void tagsServicesWithTypeAndDerivesAppSubset() {
        when(meta.selectServiceNames()).thenReturn(List.of("web-gateway", "mysql"));
        when(meta.selectOperations()).thenReturn(List.of(
            "GET", "POST", "HTTP", "GET /", "POST /", "OPTIONS /", "GET /*", "POST /*",
            "HTTP /*", "HEAD /api/v1/users/me", "OPTIONS /api/v1/users/me", "GET /api/*",
            "POST /api", "POST /api/*", "GET /files/{*key}", "GET /error", "GET /x", "SELECT"));
        when(meta.selectEnvironments()).thenReturn(List.of("production"));
        when(meta.selectNamespaces()).thenReturn(List.of("quasar"));
        when(meta.selectServiceInstances()).thenReturn(List.of("pod-uid-1"));

        FiltersResponseDTO filters = service.filters();

        assertThat(filters.getServices()).extracting("name", "type")
            .containsExactly(tuple("web-gateway", "app"), tuple("mysql", "datastore"));
        assertThat(filters.getAppServices()).containsExactly("web-gateway");
        assertThat(filters.getOperations()).containsExactly("GET /x", "SELECT");
        assertThat(filters.getEnvironments()).containsExactly("production");
        assertThat(filters.getNamespaces()).containsExactly("quasar");
        assertThat(filters.getServiceInstances()).containsExactly("pod-uid-1");
    }

    @Test
    void returnsSeveritiesInCanonicalOrder() {
        when(meta.selectServiceNames()).thenReturn(List.of());
        when(meta.selectOperations()).thenReturn(List.of());
        when(meta.selectEnvironments()).thenReturn(List.of());
        when(meta.selectNamespaces()).thenReturn(List.of());

        assertThat(service.filters().getSeverities())
            .containsExactly("TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL");
    }
}
