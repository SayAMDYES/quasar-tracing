package org.quasar.tracing.clickhouse.entity;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Distinct trace counts over a window: total traces and the subset containing an error span.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Data
@NoArgsConstructor
public class TraceCountsEntity {

    private Integer total;

    private Integer errors;
}
