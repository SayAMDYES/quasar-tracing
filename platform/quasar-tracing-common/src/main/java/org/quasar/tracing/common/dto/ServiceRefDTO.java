package org.quasar.tracing.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A lightweight service reference (name + topology type) for the filters payload.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "A service reference (name + type)")
public class ServiceRefDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Service name")
    private String name;

    @Schema(description = "Topology type", allowableValues = {"app", "datastore", "mq", "external"})
    private String type;
}
