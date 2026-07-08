package org.quasar.tracing.clickhouse.entity;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One row of the bucketed log histogram: a time bucket, a severity, and its count.
 * The core service pivots these slices into per-bucket rows.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Data
@NoArgsConstructor
public class LogHistogramSliceEntity {

    /** Bucket start time, epoch milliseconds. */
    private Long time;

    private String severity;

    /** Count of logs of this severity in the bucket. */
    private Long count;
}
