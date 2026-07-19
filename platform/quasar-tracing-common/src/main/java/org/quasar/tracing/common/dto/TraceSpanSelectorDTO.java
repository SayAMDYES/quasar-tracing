package org.quasar.tracing.common.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Fields that must match one span within a trace.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TraceSpanSelectorDTO {

    private String service;

    private String operation;

    private String status;
}
