package org.quasar.tracing.example;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point for the OpenTelemetry sample service. The application carries no tracing
 * wiring of its own — the OpenTelemetry Java Agent attaches instrumentation at JVM start
 * (see README.md), which is exactly the point of agent-based auto-instrumentation.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/15
 */
@SpringBootApplication
public class OtelSampleApplication {

    public static void main(String[] args) {
        SpringApplication.run(OtelSampleApplication.class, args);
    }
}
