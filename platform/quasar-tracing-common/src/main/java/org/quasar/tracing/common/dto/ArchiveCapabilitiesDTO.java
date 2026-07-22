package org.quasar.tracing.common.dto;

import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Public feature and retention limits for Trace Archive UI gating.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ArchiveCapabilitiesDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Boolean enabled;
    private Integer retentionDays;
    private Integer maxSpansPerTrace;
}
