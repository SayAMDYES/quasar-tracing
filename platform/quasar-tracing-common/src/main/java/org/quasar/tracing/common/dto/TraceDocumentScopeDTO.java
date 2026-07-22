package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import java.io.Serializable;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Instrumentation scope stored on a document span.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
@Data
@NoArgsConstructor
@JsonPropertyOrder({"name", "version"})
public class TraceDocumentScopeDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String name = "";

    private String version = "";
}
