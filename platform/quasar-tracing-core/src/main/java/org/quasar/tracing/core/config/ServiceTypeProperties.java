package org.quasar.tracing.core.config;

import java.util.Collections;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Maps a service name to its topology type (app / datastore / mq / external).
 * Telemetry carries no service "type", so the service map relies on this config,
 * defaulting unmapped services to {@code app}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@ConfigurationProperties(prefix = "quasar.tracing")
public record ServiceTypeProperties(Map<String, String> serviceTypes) {

    public ServiceTypeProperties {
        if (serviceTypes == null) {
            serviceTypes = Collections.emptyMap();
        }
    }
}
