package org.quasar.tracing.example.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.instrumentation.annotations.SpanAttribute;
import io.opentelemetry.instrumentation.annotations.WithSpan;
import jakarta.annotation.PostConstruct;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Order business logic. Layers manual instrumentation on top of the agent's
 * auto-instrumentation: a {@link WithSpan} method span, method arguments captured as span
 * attributes, attributes/events/status added by hand, and a custom Micrometer counter that
 * the agent exports as an OTLP metric.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/15
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class OrderService {

    private final InventoryClient inventoryClient;
    private final MeterRegistry meterRegistry;

    private Counter ordersPlaced;

    @PostConstruct
    void registerMetrics() {
        ordersPlaced = Counter.builder("orders.placed")
            .description("Total orders accepted")
            .baseUnit("orders")
            .register(meterRegistry);
    }

    @WithSpan("OrderService.placeOrder")
    public String placeOrder(@SpanAttribute("order.sku") String sku,
                             @SpanAttribute("order.quantity") int quantity) {
        Span span = Span.current();

        int available = inventoryClient.checkInventory(sku);
        span.setAttribute("inventory.available", available);

        if (available < quantity) {
            span.addEvent("inventory.insufficient");
            span.setStatus(StatusCode.ERROR, "insufficient inventory");
            log.warn("Rejected order: sku={} requested={} available={}", sku, quantity, available);
            throw new IllegalStateException("Insufficient inventory for " + sku);
        }

        String orderId = UUID.randomUUID().toString();
        span.setAttribute("order.id", orderId);
        ordersPlaced.increment();
        log.info("Reserved {} x {} for order {}", quantity, sku, orderId);
        return orderId;
    }
}
