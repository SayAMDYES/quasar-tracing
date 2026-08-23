package org.quasar.tracing.core.service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.quasar.tracing.clickhouse.entity.ServiceEdgeEntity;
import org.quasar.tracing.clickhouse.entity.ServiceNodeStatEntity;
import org.quasar.tracing.clickhouse.mapper.MetricMapper;
import org.quasar.tracing.clickhouse.mapper.ServiceMapper;
import org.quasar.tracing.common.dto.DependencyGraphDTO;
import org.quasar.tracing.common.dto.EndpointRedDTO;
import org.quasar.tracing.common.dto.ServiceDetailDTO;
import org.quasar.tracing.common.dto.ServiceEdgeDTO;
import org.quasar.tracing.common.dto.ServiceNodeDTO;
import org.quasar.tracing.common.dto.ServiceStatDTO;
import org.quasar.tracing.common.util.TimeWindowUtil;
import org.quasar.tracing.core.classify.ServiceClassifier;
import org.quasar.tracing.core.exception.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * Service-map read paths: the dependency graph, the enriched service list, and per-service
 * detail. Tags nodes with their topology type, derives upstream/downstream fan counts from the
 * edges, synthesizes infrastructure nodes from Client Span targets, and assembles the
 * per-endpoint RED breakdown for stored services.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Service
@RequiredArgsConstructor
public class ServiceMapService {

    private final ServiceMapper serviceMapper;
    private final MetricMapper metricMapper;
    private final ServiceClassifier classifier;
    private final EndpointRedAssembler endpointRedAssembler;
    private final ServiceTechCache serviceTechCache;

    public DependencyGraphDTO dependencies(Long from, Long to) {
        Long toMs = TimeWindowUtil.resolveTo(to);
        Long fromMs = TimeWindowUtil.resolveFrom(from, toMs);
        TopologyData topology = loadTopology(fromMs, toMs);
        List<ServiceNodeDTO> nodes = topology.nodes().stream()
            .map(this::toNode).toList();
        List<ServiceEdgeDTO> edges = topology.edges().stream()
            .map(ServiceMapService::toEdge).toList();
        return new DependencyGraphDTO(nodes, edges);
    }

    public List<ServiceStatDTO> services(Long from, Long to) {
        Long toMs = TimeWindowUtil.resolveTo(to);
        Long fromMs = TimeWindowUtil.resolveFrom(from, toMs);
        TopologyData topology = loadTopology(fromMs, toMs);
        return topology.nodes().stream()
            .map(node -> toStat(node, topology.edges())).toList();
    }

    public ServiceDetailDTO detail(String name, Long from, Long to) {
        Long toMs = TimeWindowUtil.resolveTo(to);
        Long fromMs = TimeWindowUtil.resolveFrom(from, toMs);
        TopologyData topology = loadTopology(fromMs, toMs);
        ServiceNodeStatEntity node = topology.nodes().stream()
            .filter(n -> n.getName().equals(name)).findFirst()
            .orElseThrow(() -> new NotFoundException("Service not found: " + name));
        List<ServiceEdgeDTO> upstreams = topology.edges().stream()
            .filter(e -> e.getCallee().equals(name)).map(ServiceMapService::toEdge).toList();
        List<ServiceEdgeDTO> downstreams = topology.edges().stream()
            .filter(e -> e.getCaller().equals(name)).map(ServiceMapService::toEdge).toList();
        List<EndpointRedDTO> endpoints = Boolean.TRUE.equals(node.getVirtual())
            ? List.of()
            : endpointRedAssembler.assemble(
                metricMapper.endpointRed(name, null, null, null, fromMs, toMs), fromMs, toMs);
        return new ServiceDetailDTO(name, resolveType(node), resolveTech(node),
            Boolean.TRUE.equals(node.getVirtual()),
            node.getCalls(), node.getErrorRate(), node.getAvgDurationNs(),
            node.getP50(), node.getP90(), node.getP99(), endpoints, upstreams, downstreams);
    }

    private ServiceNodeDTO toNode(ServiceNodeStatEntity e) {
        return new ServiceNodeDTO(e.getName(), resolveType(e), resolveTech(e),
            e.getCalls(), e.getErrorRate(), e.getAvgDurationNs());
    }

    private ServiceStatDTO toStat(ServiceNodeStatEntity e, List<ServiceEdgeEntity> edges) {
        int upstreams = (int) edges.stream().filter(x -> x.getCallee().equals(e.getName())).count();
        int downstreams = (int) edges.stream().filter(x -> x.getCaller().equals(e.getName())).count();
        return new ServiceStatDTO(e.getName(), resolveType(e), resolveTech(e),
            e.getCalls(), e.getErrorRate(), e.getAvgDurationNs(),
            e.getP50(), e.getP90(), e.getP99(), upstreams, downstreams);
    }

    private TopologyData loadTopology(Long from, Long to) {
        List<ServiceEdgeEntity> edges = serviceMapper.selectEdges(from, to);
        List<ServiceNodeStatEntity> nodes = new ArrayList<>(serviceMapper.selectNodeStats(from, to));
        Set<String> existingNames = new HashSet<>(nodes.stream().map(ServiceNodeStatEntity::getName).toList());
        nodes.addAll(infrastructureNodes(edges, existingNames));
        return new TopologyData(nodes, edges);
    }

    private static List<ServiceNodeStatEntity> infrastructureNodes(
            List<ServiceEdgeEntity> edges, Set<String> existingNames) {
        Map<String, List<ServiceEdgeEntity>> byTarget = new LinkedHashMap<>();
        for (ServiceEdgeEntity edge : edges) {
            if (StringUtils.hasText(edge.getCalleeType()) && !existingNames.contains(edge.getCallee())) {
                byTarget.computeIfAbsent(edge.getCallee(), ignored -> new ArrayList<>()).add(edge);
            }
        }
        return byTarget.entrySet().stream()
            .map(entry -> toInfrastructureNode(entry.getKey(), entry.getValue()))
            .toList();
    }

    private static ServiceNodeStatEntity toInfrastructureNode(
            String name, List<ServiceEdgeEntity> edges) {
        long calls = 0;
        long errors = 0;
        double totalDurationNs = 0;
        String type = null;
        String tech = null;
        for (ServiceEdgeEntity edge : edges) {
            long edgeCalls = edge.getCallCount() == null ? 0 : edge.getCallCount();
            calls += edgeCalls;
            errors += edge.getErrorCount() == null ? 0 : edge.getErrorCount();
            totalDurationNs += (edge.getAvgDurationNs() == null ? 0 : edge.getAvgDurationNs()) * edgeCalls;
            if (!StringUtils.hasText(type)) {
                type = edge.getCalleeType();
            }
            if (!StringUtils.hasText(tech)) {
                tech = edge.getCalleeTech();
            }
        }

        ServiceNodeStatEntity node = new ServiceNodeStatEntity();
        node.setName(name);
        node.setType(type);
        node.setVirtual(true);
        node.setTech(tech);
        node.setCalls(calls);
        node.setErrorRate(calls == 0 ? 0 : (double) errors / calls);
        node.setAvgDurationNs(calls == 0 ? 0 : totalDurationNs / calls);
        return node;
    }

    private String resolveType(ServiceNodeStatEntity node) {
        return StringUtils.hasText(node.getType()) ? node.getType() : classifier.typeOf(node.getName());
    }

    private String resolveTech(ServiceNodeStatEntity e) {
        return serviceTechCache.resolve(e.getName(), e.getTech());
    }

    private static ServiceEdgeDTO toEdge(ServiceEdgeEntity e) {
        return new ServiceEdgeDTO(e.getCaller(), e.getCallee(), e.getCallCount(), e.getErrorCount(),
            e.getErrorRate(), e.getAvgDurationNs(), EndpointOperationFilter.keepMeaningful(e.getOperations()));
    }

    private record TopologyData(List<ServiceNodeStatEntity> nodes, List<ServiceEdgeEntity> edges) {
    }
}
