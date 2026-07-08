package org.quasar.tracing.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.util.List;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.quasar.tracing.common.api.QTPageDTO;

/**
 * Log search result: a page of records plus a per-bucket severity histogram for the chart.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Log search result with severity histogram")
public class LogSearchResultDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Paged log records")
    private QTPageDTO<LogRecordDTO> page;

    @Schema(description = "Per-bucket counts; each row is { time: epochMs, <SEVERITY>: count, ... }")
    private List<Map<String, Object>> histogram;
}
