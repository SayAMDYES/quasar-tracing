package org.quasar.tracing.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * The service-map graph: nodes and directed dependency edges.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Service dependency graph")
public class DependencyGraphDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Service nodes")
    private List<ServiceNodeDTO> nodes;

    @Schema(description = "Directed dependency edges")
    private List<ServiceEdgeDTO> edges;
}
