package org.quasar.tracing.core.service;

import java.util.List;
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

/**
 * Service-map read paths: the dependency graph, the enriched service list, and per-service
 * detail. Tags nodes with their topology type, derives upstream/downstream fan counts from the
 * edges, and assembles the per-endpoint RED breakdown for detail.
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
        List<ServiceNodeDTO> nodes = serviceMapper.selectNodeStats(fromMs, toMs).stream()
            .map(this::toNode).toList();
        List<ServiceEdgeDTO> edges = serviceMapper.selectEdges(fromMs, toMs).stream()
            .map(ServiceMapService::toEdge).toList();
        return new DependencyGraphDTO(nodes, edges);
    }

    public List<ServiceStatDTO> services(Long from, Long to) {
        Long toMs = TimeWindowUtil.resolveTo(to);
        Long fromMs = TimeWindowUtil.resolveFrom(from, toMs);
        List<ServiceEdgeEntity> edges = serviceMapper.selectEdges(fromMs, toMs);
        return serviceMapper.selectNodeStats(fromMs, toMs).stream()
            .map(node -> toStat(node, edges)).toList();
    }

    public ServiceDetailDTO detail(String name, Long from, Long to) {
        Long toMs = TimeWindowUtil.resolveTo(to);
        Long fromMs = TimeWindowUtil.resolveFrom(from, toMs);
        ServiceNodeStatEntity node = serviceMapper.selectNodeStats(fromMs, toMs).stream()
            .filter(n -> n.getName().equals(name)).findFirst()
            .orElseThrow(() -> new NotFoundException("Service not found: " + name));
        List<ServiceEdgeEntity> edges = serviceMapper.selectEdges(fromMs, toMs);
        List<ServiceEdgeDTO> upstreams = edges.stream()
            .filter(e -> e.getCallee().equals(name)).map(ServiceMapService::toEdge).toList();
        List<ServiceEdgeDTO> downstreams = edges.stream()
            .filter(e -> e.getCaller().equals(name)).map(ServiceMapService::toEdge).toList();
        List<EndpointRedDTO> endpoints = endpointRedAssembler.assemble(
            metricMapper.endpointRed(name, null, null, null, fromMs, toMs), fromMs, toMs);
        return new ServiceDetailDTO(name, classifier.typeOf(name), resolveTech(node),
            node.getCalls(), node.getErrorRate(), node.getAvgDurationNs(),
            node.getP50(), node.getP90(), node.getP99(), endpoints, upstreams, downstreams);
    }

    private ServiceNodeDTO toNode(ServiceNodeStatEntity e) {
        return new ServiceNodeDTO(e.getName(), classifier.typeOf(e.getName()), resolveTech(e),
            e.getCalls(), e.getErrorRate(), e.getAvgDurationNs());
    }

    private ServiceStatDTO toStat(ServiceNodeStatEntity e, List<ServiceEdgeEntity> edges) {
        int upstreams = (int) edges.stream().filter(x -> x.getCallee().equals(e.getName())).count();
        int downstreams = (int) edges.stream().filter(x -> x.getCaller().equals(e.getName())).count();
        return new ServiceStatDTO(e.getName(), classifier.typeOf(e.getName()), resolveTech(e),
            e.getCalls(), e.getErrorRate(), e.getAvgDurationNs(),
            e.getP50(), e.getP90(), e.getP99(), upstreams, downstreams);
    }

    private String resolveTech(ServiceNodeStatEntity e) {
        return serviceTechCache.resolve(e.getName(), e.getTech());
    }

    private static ServiceEdgeDTO toEdge(ServiceEdgeEntity e) {
        return new ServiceEdgeDTO(e.getCaller(), e.getCallee(), e.getCallCount(), e.getErrorCount(),
            e.getErrorRate(), e.getAvgDurationNs(), EndpointOperationFilter.keepMeaningful(e.getOperations()));
    }
}
