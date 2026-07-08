package org.quasar.tracing.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * /overview payload: KPIs, the platform series, busiest endpoints, per-service health
 * (app services only), and the most recent error logs.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Overview dashboard payload")
public class OverviewResponseDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Headline KPIs")
    private OverviewKpisDTO kpis;

    @Schema(description = "Platform-wide time series")
    private List<OverviewPointDTO> series;

    @Schema(description = "Busiest endpoints (≤8)")
    private List<TopEndpointDTO> topEndpoints;

    @Schema(description = "Per-service health (app services)")
    private List<ServiceStatDTO> services;

    @Schema(description = "Most recent error logs (≤8)")
    private List<LogRecordDTO> recentErrors;
}
