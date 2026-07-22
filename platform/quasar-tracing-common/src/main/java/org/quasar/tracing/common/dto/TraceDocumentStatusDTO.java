package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import java.io.Serializable;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * OpenTelemetry status stored on a document span.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
@Data
@NoArgsConstructor
@JsonPropertyOrder({"code", "message"})
public class TraceDocumentStatusDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String code = "";

    private String message = "";
}
