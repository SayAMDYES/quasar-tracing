package org.quasar.tracing.core.service;

import java.util.List;
import org.quasar.tracing.clickhouse.mapper.MetaMapper;
import org.quasar.tracing.common.dto.FiltersResponseDTO;
import org.quasar.tracing.common.dto.ServiceRefDTO;
import org.quasar.tracing.core.classify.ServiceClassifier;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Assembles the {@code /api/filters} payload: every known service tagged with its
 * topology type, the app-service subset, and the operation / environment catalogs.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Service
@RequiredArgsConstructor
public class FilterService {

    /** Canonical severity order, returned verbatim so the UI severity dropdown stays stable. */
    private static final List<String> SEVERITIES =
        List.of("TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL");

    private final MetaMapper meta;
    private final ServiceClassifier classifier;

    public FiltersResponseDTO filters() {
        List<String> names = meta.selectServiceNames();
        List<ServiceRefDTO> services = names.stream()
            .map(name -> new ServiceRefDTO(name, classifier.typeOf(name)))
            .toList();
        List<String> appServices = names.stream()
            .filter(classifier::isApp)
            .toList();
        List<String> operations = meta.selectOperations().stream()
            .filter(EndpointOperationFilter::isMeaningful)
            .toList();
        return new FiltersResponseDTO(services, appServices,
            operations, meta.selectEnvironments(),
            meta.selectNamespaces(), meta.selectK8sNamespaces(), meta.selectK8sPodNames(),
            meta.selectK8sNodeNames(), meta.selectServiceInstances(), SEVERITIES);
    }
}
