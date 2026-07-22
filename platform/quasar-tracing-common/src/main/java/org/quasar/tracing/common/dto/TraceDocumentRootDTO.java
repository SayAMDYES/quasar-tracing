package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import java.io.Serializable;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Canonical primary root selected for a trace document.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
@Data
@NoArgsConstructor
@JsonPropertyOrder({"spanId", "serviceName", "name", "selection"})
public class TraceDocumentRootDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String spanId = "";

    private String serviceName = "";

    private String name = "";

    private String selection = "";
}
