package org.quasar.tracing.example.service;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Calls the service's own {@code /internal/inventory} endpoint over HTTP. The agent
 * auto-instruments the {@link RestClient} call, so the outbound request becomes a CLIENT
 * span and trace context propagates to the downstream SERVER span via the {@code traceparent}
 * header — no manual propagation code required.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/15
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class InventoryClient {

    private final RestClient restClient;

    public int checkInventory(String sku) {
        log.debug("Calling inventory service: sku={}", sku);
        Map<String, Object> body = restClient.get()
            .uri("/internal/inventory/{sku}", sku)
            .retrieve()
            .body(new ParameterizedTypeReference<>() {
            });
        Object available = body == null ? null : body.get("available");
        return available instanceof Number number ? number.intValue() : 0;
    }
}
