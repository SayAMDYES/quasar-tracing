package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import java.io.Serializable;
import java.util.Map;
import java.util.TreeMap;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Link stored on a document span.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
@Data
@NoArgsConstructor
@JsonPropertyOrder({"traceId", "spanId", "traceState", "attributes"})
public class TraceDocumentLinkDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String traceId = "";

    private String spanId = "";

    private String traceState = "";

    private Map<String, String> attributes = new TreeMap<>(TraceDocumentDTO.unicodeComparator());

    public void setAttributes(Map<String, String> attributes) {
        this.attributes = TraceDocumentDTO.sortedAttributes(attributes);
    }
}
