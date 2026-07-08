package org.quasar.tracing.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Faceted-search options for the UI: services (with type), the app-service subset,
 * known operations, environments, and the canonical severity list.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Faceted-search options for the UI")
public class FiltersResponseDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Services with their topology type")
    private List<ServiceRefDTO> services;

    @Schema(description = "App-service names (subset of services)")
    private List<String> appServices;

    @Schema(description = "Known operation names")
    private List<String> operations;

    @Schema(description = "Known environments")
    private List<String> environments;

    @Schema(description = "Known generic namespaces")
    private List<String> namespaces;

    @Schema(description = "Known Kubernetes namespaces")
    private List<String> k8sNamespaces;

    @Schema(description = "Known Kubernetes pod names")
    private List<String> k8sPodNames;

    @Schema(description = "Known Kubernetes node names")
    private List<String> k8sNodeNames;

    @Schema(description = "Known OTel service instance ids")
    private List<String> serviceInstances;

    @Schema(description = "Canonical severity list")
    private List<String> severities;
}
