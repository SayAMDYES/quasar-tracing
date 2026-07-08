package org.quasar.tracing.core.service;

import java.util.List;
import org.quasar.tracing.clickhouse.entity.EndpointRedEntity;
import org.quasar.tracing.common.dto.EndpointRedDTO;
import org.springframework.stereotype.Component;

/**
 * Converts per-endpoint RED row entities (counts + nanosecond percentiles) into the API DTO,
 * deriving the error ratio, RPS over the window, and millisecond percentiles. Shared by the
 * service-detail and metrics read paths so the unit conversions live in one place.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Component
public class EndpointRedAssembler {

    private static final double NANOS_PER_MILLI = 1_000_000.0;

    /**
     * @param rows   endpoint RED rows for one service
     * @param fromMs window start, epoch milliseconds
     * @param toMs   window end, epoch milliseconds
     * @return the API breakdown (percentiles in milliseconds)
     */
    public List<EndpointRedDTO> assemble(List<EndpointRedEntity> rows, Long fromMs, Long toMs) {
        double windowSeconds = Math.max(1.0, (toMs - fromMs) / 1000.0);
        return rows.stream()
            .filter(e -> EndpointOperationFilter.isMeaningful(e.getOperation()))
            .map(e -> new EndpointRedDTO(e.getOperation(), e.getRequestCount(),
                e.getRequestCount() / windowSeconds, ratio(e.getErrorCount(), e.getRequestCount()),
                nsToMs(e.getP50()), nsToMs(e.getP90()), nsToMs(e.getP99())))
            .toList();
    }

    private static Double nsToMs(Double ns) {
        return ns == null ? null : ns / NANOS_PER_MILLI;
    }

    private static Double ratio(Long numerator, Long denominator) {
        return (denominator == null || denominator == 0) ? 0.0 : (double) numerator / denominator;
    }
}
