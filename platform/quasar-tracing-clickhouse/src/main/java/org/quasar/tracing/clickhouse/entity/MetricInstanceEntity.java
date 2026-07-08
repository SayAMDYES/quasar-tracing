package org.quasar.tracing.clickhouse.entity;

import java.util.Map;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Per-instance RED aggregate from {@code spans}, grouped by {@code service.instance.id}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/05
 */
@Data
@NoArgsConstructor
public class MetricInstanceEntity {

    private String serviceInstanceId;

    private Long requestCount;

    private Long errorCount;

    private Double p99;

    private Map<String, String> resourceAttributes;
}
