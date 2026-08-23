package org.quasar.tracing.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.quasar.tracing.clickhouse.entity.EndpointRedEntity;
import org.quasar.tracing.clickhouse.entity.ServiceEdgeEntity;
import org.quasar.tracing.clickhouse.entity.ServiceNodeStatEntity;
import org.quasar.tracing.clickhouse.mapper.MetricMapper;
import org.quasar.tracing.clickhouse.mapper.ServiceMapper;
import org.quasar.tracing.common.dto.DependencyGraphDTO;
import org.quasar.tracing.common.dto.ServiceDetailDTO;
import org.quasar.tracing.common.dto.ServiceNodeDTO;
import org.quasar.tracing.common.dto.ServiceStatDTO;
import org.quasar.tracing.core.classify.ServiceClassifier;
import org.quasar.tracing.core.config.ServiceTypeProperties;
import org.quasar.tracing.core.exception.NotFoundException;

/**
 * Unit tests for {@link ServiceMapService}: node typing, fan counts, and the ns→ms / rps
 * conversions in detail.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
class ServiceMapServiceTest {

    private final ServiceMapper serviceMapper = Mockito.mock(ServiceMapper.class);
    private final MetricMapper metricMapper = Mockito.mock(MetricMapper.class);
    private final ServiceMapService service = new ServiceMapService(serviceMapper, metricMapper,
        new ServiceClassifier(new ServiceTypeProperties(Map.of("mysql", "datastore"))), new EndpointRedAssembler(),
        new ServiceTechCache(Clock.fixed(Instant.parse("2026-07-06T00:00:00Z"), ZoneOffset.UTC)));

    @Test
    void dependenciesTagNodeTypesAndKeepEdges() {
        when(serviceMapper.selectNodeStats(any(), any()))
            .thenReturn(List.of(node("web-gateway", "Spring"), node("mysql", "MySQL")));
        when(serviceMapper.selectEdges(any(), any())).thenReturn(List.of(edge("web-gateway", "mysql")));

        DependencyGraphDTO graph = service.dependencies(0L, 1000L);

        assertThat(graph.getNodes()).extracting("name", "type", "tech")
            .containsExactly(tuple("web-gateway", "app", "Spring"), tuple("mysql", "datastore", "MySQL"));
        assertThat(graph.getEdges()).extracting("caller", "callee").containsExactly(tuple("web-gateway", "mysql"));
        assertThat(graph.getEdges().get(0).getOperations()).containsExactly("SELECT", "GET /orders");
    }

    @Test
    void dependenciesKeepHigherPriorityTechForSameService() {
        when(serviceMapper.selectEdges(any(), any())).thenReturn(List.of());
        when(serviceMapper.selectNodeStats(any(), any()))
            .thenReturn(List.of(node("dumouse-home", "Spring")))
            .thenReturn(List.of(node("dumouse-home", "Java")));

        assertThat(service.dependencies(0L, 1000L).getNodes())
            .extracting("name", "tech")
            .containsExactly(tuple("dumouse-home", "Spring"));
        assertThat(service.dependencies(0L, 1000L).getNodes())
            .extracting("name", "tech")
            .containsExactly(tuple("dumouse-home", "Spring"));
    }

    @Test
    void dependenciesAddVirtualInfrastructureNodesFromClientEdges() {
        String database = "PostgreSQL · dumousehome · database.internal:5432";
        when(serviceMapper.selectNodeStats(any(), any())).thenReturn(List.of(node("web-gateway")));
        when(serviceMapper.selectEdges(any(), any())).thenReturn(List.of(
            infrastructureEdge("web-gateway", database, 5L, 0L, 2_000_000.0),
            infrastructureEdge("worker", database, 3L, 1L, 4_000_000.0)));

        DependencyGraphDTO graph = service.dependencies(0L, 1000L);

        assertThat(graph.getNodes()).extracting("name", "type", "tech", "calls")
            .contains(tuple(database, "datastore", "PostgreSQL", 8L));
        ServiceNodeDTO databaseNode = graph.getNodes().stream()
            .filter(node -> database.equals(node.getName())).findFirst().orElseThrow();
        assertThat(databaseNode.getErrorRate()).isEqualTo(0.125);
        assertThat(databaseNode.getAvgDurationNs()).isEqualTo(2_750_000.0);
    }

    @Test
    void servicesAddUpstreamDownstreamCounts() {
        when(serviceMapper.selectNodeStats(any(), any()))
            .thenReturn(List.of(node("web-gateway"), node("mysql")));
        when(serviceMapper.selectEdges(any(), any())).thenReturn(List.of(edge("web-gateway", "mysql")));

        List<ServiceStatDTO> services = service.services(0L, 1000L);

        ServiceStatDTO web = byName(services, "web-gateway");
        ServiceStatDTO mysql = byName(services, "mysql");
        assertThat(web.getUpstreams()).isZero();
        assertThat(web.getDownstreams()).isEqualTo(1);
        assertThat(mysql.getUpstreams()).isEqualTo(1);
        assertThat(mysql.getDownstreams()).isZero();
    }

    @Test
    void detailConvertsEndpointsToMsAndSplitsEdges() {
        when(serviceMapper.selectNodeStats(any(), any())).thenReturn(List.of(node("mysql")));
        when(serviceMapper.selectEdges(any(), any())).thenReturn(List.of(edge("web-gateway", "mysql")));
        EndpointRedEntity endpoint = new EndpointRedEntity();
        endpoint.setOperation("SELECT");
        endpoint.setRequestCount(10L);
        endpoint.setErrorCount(2L);
        endpoint.setP50(1_000_000.0);
        endpoint.setP90(5_000_000.0);
        endpoint.setP99(9_000_000.0);
        when(metricMapper.endpointRed(any(), any(), any(), any(), any(), any())).thenReturn(List.of(endpoint));

        // 1-second window → rps = 10 / 1
        ServiceDetailDTO detail = service.detail("mysql", 0L, 1000L);

        assertThat(detail.getType()).isEqualTo("datastore");
        assertThat(detail.getP99()).isEqualTo(9_000_000.0);
        assertThat(detail.getUpstreams()).extracting("caller").containsExactly("web-gateway");
        assertThat(detail.getDownstreams()).isEmpty();
        assertThat(detail.getEndpoints()).hasSize(1);
        assertThat(detail.getEndpoints().get(0).getP99()).isEqualTo(9.0);
        assertThat(detail.getEndpoints().get(0).getErrorRate()).isEqualTo(0.2);
        assertThat(detail.getEndpoints().get(0).getRps()).isEqualTo(10.0);
    }

    @Test
    void detailKeepsVirtualInfrastructureFocusedOnDependencyEvidence() {
        String database = "PostgreSQL · dumousehome · database.internal:5432";
        when(serviceMapper.selectNodeStats(any(), any())).thenReturn(List.of(node("web-gateway")));
        when(serviceMapper.selectEdges(any(), any())).thenReturn(List.of(
            infrastructureEdge("web-gateway", database, 5L, 0L, 2_000_000.0)));

        ServiceDetailDTO detail = service.detail(database, 0L, 1000L);

        assertThat(detail.getVirtual()).isTrue();
        assertThat(detail.getType()).isEqualTo("datastore");
        assertThat(detail.getTech()).isEqualTo("PostgreSQL");
        assertThat(detail.getEndpoints()).isEmpty();
        assertThat(detail.getUpstreams()).extracting("caller").containsExactly("web-gateway");
        verifyNoInteractions(metricMapper);
    }

    @Test
    void detailThrowsNotFoundForUnknownService() {
        when(serviceMapper.selectNodeStats(any(), any())).thenReturn(List.of(node("web-gateway")));
        assertThatThrownBy(() -> service.detail("ghost", 0L, 1000L)).isInstanceOf(NotFoundException.class);
    }

    private static ServiceStatDTO byName(List<ServiceStatDTO> services, String name) {
        return services.stream().filter(s -> s.getName().equals(name)).findFirst().orElseThrow();
    }

    private static ServiceNodeStatEntity node(String name) {
        return node(name, null);
    }

    private static ServiceNodeStatEntity node(String name, String tech) {
        ServiceNodeStatEntity n = new ServiceNodeStatEntity();
        n.setName(name);
        n.setTech(tech);
        n.setCalls(100L);
        n.setErrorRate(0.1);
        n.setAvgDurationNs(2_000_000.0);
        n.setP50(1_000_000.0);
        n.setP90(5_000_000.0);
        n.setP99(9_000_000.0);
        return n;
    }

    private static ServiceEdgeEntity edge(String caller, String callee) {
        ServiceEdgeEntity e = new ServiceEdgeEntity();
        e.setCaller(caller);
        e.setCallee(callee);
        e.setCallCount(5L);
        e.setErrorCount(0L);
        e.setErrorRate(0.0);
        e.setAvgDurationNs(2_000_000.0);
        e.setOperations(List.of("SELECT", "HTTP", "HTTP /*", "GET /*", "GET /api/*",
            "HEAD /api/v1/users/me", "OPTIONS /api/v1/users/me", "POST /api",
            "GET /files/{*key}", "GET /orders"));
        return e;
    }

    private static ServiceEdgeEntity infrastructureEdge(
            String caller, String callee, Long calls, Long errors, Double avgDurationNs) {
        ServiceEdgeEntity edge = edge(caller, callee);
        edge.setCalleeType("datastore");
        edge.setCalleeTech("PostgreSQL");
        edge.setCallCount(calls);
        edge.setErrorCount(errors);
        edge.setErrorRate(calls == 0 ? 0 : (double) errors / calls);
        edge.setAvgDurationNs(avgDurationNs);
        edge.setOperations(List.of("SELECT dumousehome.recurring_expenses"));
        return edge;
    }
}
