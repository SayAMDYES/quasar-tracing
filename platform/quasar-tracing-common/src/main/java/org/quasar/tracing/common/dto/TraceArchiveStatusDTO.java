package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Logical Archive state exposed by status and write APIs.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TraceArchiveStatusDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Boolean archived;
    private String state;
    private String traceId;
    private String generation;
    private String revision;

    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long archivedAt;

    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long expiresAt;

    private Integer spanCount;
    private String checksumSha256;
}
