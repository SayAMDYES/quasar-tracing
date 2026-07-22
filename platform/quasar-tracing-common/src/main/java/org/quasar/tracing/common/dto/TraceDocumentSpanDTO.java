package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Complete stored span representation used by trace documents.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
@Data
@NoArgsConstructor
@JsonPropertyOrder({
        "traceId", "spanId", "parentSpanId", "traceState", "serviceName", "name", "kind",
        "startTimeUnixNano", "durationNano", "status", "resourceAttributes", "scope",
        "spanAttributes", "events", "links"
})
public class TraceDocumentSpanDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String traceId = "";

    private String spanId = "";

    private String parentSpanId = "";

    private String traceState = "";

    private String serviceName = "";

    private String name = "";

    private String kind = "";

    private String startTimeUnixNano = "";

    private String durationNano = "";

    private TraceDocumentStatusDTO status = new TraceDocumentStatusDTO();

    private Map<String, String> resourceAttributes =
            new TreeMap<>(TraceDocumentDTO.unicodeComparator());

    private TraceDocumentScopeDTO scope = new TraceDocumentScopeDTO();

    private Map<String, String> spanAttributes =
            new TreeMap<>(TraceDocumentDTO.unicodeComparator());

    private List<TraceDocumentEventDTO> events = new ArrayList<>();

    private List<TraceDocumentLinkDTO> links = new ArrayList<>();

    public void setStatus(TraceDocumentStatusDTO status) {
        this.status = status == null ? new TraceDocumentStatusDTO() : status;
    }

    public void setResourceAttributes(Map<String, String> resourceAttributes) {
        this.resourceAttributes = TraceDocumentDTO.sortedAttributes(resourceAttributes);
    }

    public void setScope(TraceDocumentScopeDTO scope) {
        this.scope = scope == null ? new TraceDocumentScopeDTO() : scope;
    }

    public void setSpanAttributes(Map<String, String> spanAttributes) {
        this.spanAttributes = TraceDocumentDTO.sortedAttributes(spanAttributes);
    }

    public void setEvents(List<TraceDocumentEventDTO> events) {
        this.events = events == null ? new ArrayList<>() : new ArrayList<>(events);
    }

    public void setLinks(List<TraceDocumentLinkDTO> links) {
        this.links = links == null ? new ArrayList<>() : new ArrayList<>(links);
    }
}
