package org.quasar.tracing.example.web;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.quasar.tracing.example.service.OrderService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Demo endpoints that produce one trace per request. {@code POST /orders} drives the full
 * SERVER → CLIENT → SERVER span chain; {@code GET /internal/inventory/{sku}} is the
 * downstream hop the order flow calls back into to demonstrate context propagation.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/15
 */
@RestController
@RequiredArgsConstructor
@Slf4j
public class OrderController {

    private final OrderService orderService;

    @PostMapping("/orders")
    public Map<String, Object> placeOrder(@RequestBody OrderRequest request) {
        log.info("Received order: sku={}, quantity={}", request.sku(), request.quantity());
        String orderId = orderService.placeOrder(request.sku(), request.quantity());
        log.info("Order accepted: {}", orderId);
        return Map.of(
            "orderId", orderId,
            "sku", request.sku(),
            "quantity", request.quantity());
    }

    @GetMapping("/internal/inventory/{sku}")
    public Map<String, Object> inventory(@PathVariable String sku) {
        log.info("Inventory lookup: sku={}", sku);
        // Deterministic 50..99 so the happy path always succeeds and only large
        // quantities exercise the insufficient-inventory error branch.
        int available = 50 + Math.floorMod(sku.hashCode(), 50);
        return Map.of("sku", sku, "available", available);
    }

    /**
     * Incoming order payload.
     */
    public record OrderRequest(String sku, Integer quantity) {
    }
}
