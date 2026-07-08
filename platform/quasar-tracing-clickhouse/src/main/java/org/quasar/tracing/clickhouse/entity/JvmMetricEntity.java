package org.quasar.tracing.clickhouse.entity;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * JVM metric aggregate from OTel metric tables.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/05
 */
@Data
@NoArgsConstructor
public class JvmMetricEntity {

    private String serviceInstanceId;

    private Double heapUsed;

    private Double heapLimit;

    private Double cpuUtilization;

    private Double threadCount;

    private Double gcDuration;
}
