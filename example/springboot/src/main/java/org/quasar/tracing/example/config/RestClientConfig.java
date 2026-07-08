package org.quasar.tracing.example.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Builds the {@link RestClient} the order flow uses to call the service's own internal
 * endpoint. The base URL defaults to the local port and is overridable via
 * {@code sample.self-base-url}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/15
 */
@Configuration
public class RestClientConfig {

    @Bean
    public RestClient restClient(RestClient.Builder builder,
                                 @Value("${sample.self-base-url}") String baseUrl) {
        return builder.baseUrl(baseUrl).build();
    }
}
