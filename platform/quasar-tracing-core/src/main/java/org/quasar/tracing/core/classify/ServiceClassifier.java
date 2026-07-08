package org.quasar.tracing.core.classify;

import org.quasar.tracing.core.config.ServiceTypeProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Resolves a service name to its topology type (app / datastore / mq / external).
 *
 * <p>Telemetry carries no service "type", so the mapping comes from
 * {@link ServiceTypeProperties}; any service not listed there defaults to {@code app}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Component
@RequiredArgsConstructor
public class ServiceClassifier {

    private static final String DEFAULT_TYPE = "app";

    private final ServiceTypeProperties props;

    /**
     * @param service the service name from telemetry
     * @return its configured topology type, or {@code app} when unmapped
     */
    public String typeOf(String service) {
        return props.serviceTypes().getOrDefault(service, DEFAULT_TYPE);
    }

    /**
     * @param service the service name from telemetry
     * @return {@code true} when the service is an application service (not a datastore/mq/external)
     */
    public Boolean isApp(String service) {
        return DEFAULT_TYPE.equals(typeOf(service));
    }
}
