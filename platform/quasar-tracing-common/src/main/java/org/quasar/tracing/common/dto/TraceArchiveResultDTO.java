package org.quasar.tracing.common.dto;

import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Archive operation result, including whether this request created the winning snapshot.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TraceArchiveResultDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Boolean created;
    private TraceArchiveStatusDTO archive;
}
