package org.quasar.tracing.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Full trace detail: header summary, the flat span list, and participating services.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Full trace detail")
public class TraceDetailDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Trace header summary")
    private TraceSummaryDTO summary;

    @Schema(description = "Flat list of spans, ordered by start time")
    private List<SpanDTO> spans;

    @Schema(description = "Distinct services in the trace")
    private List<String> services;
}
