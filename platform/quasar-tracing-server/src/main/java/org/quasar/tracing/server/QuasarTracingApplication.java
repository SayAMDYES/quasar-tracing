package org.quasar.tracing.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Observability platform server entry point. Component scanning and
 * configuration-properties scanning are widened to the whole
 * {@code org.quasar.tracing} tree so beans defined in the clickhouse/core
 * modules are discovered.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@SpringBootApplication(scanBasePackages = "org.quasar.tracing")
@ConfigurationPropertiesScan("org.quasar.tracing")
public class QuasarTracingApplication {

    public static void main(String[] args) {
        SpringApplication.run(QuasarTracingApplication.class, args);
    }
}
