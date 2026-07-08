package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A single span event (e.g. an exception) carried in the trace detail.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "A span event, e.g. an exception")
public class SpanEventDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Event name", example = "exception")
    private String name;

    @Schema(description = "Event time, epoch milliseconds")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long timestamp;

    @Schema(description = "Event attributes")
    private Map<String, String> attributes;
}
