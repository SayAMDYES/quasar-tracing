package org.quasar.tracing.core.service;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Filters generic HTTP fallback operations that dilute endpoint statistics.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/06
 */
final class EndpointOperationFilter {

    private static final Set<String> HTTP_METHODS = Set.of(
        "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "CONNECT", "HTTP");

    private static final Set<String> NOISE_METHODS = Set.of("HEAD", "OPTIONS", "HTTP");

    private EndpointOperationFilter() {
    }

    static boolean isMeaningful(String operation) {
        if (operation == null || operation.isBlank()) {
            return false;
        }
        String trimmed = operation.trim();
        int separator = trimmed.indexOf(' ');
        if (separator < 0) {
            return !HTTP_METHODS.contains(trimmed.toUpperCase(Locale.ROOT));
        }
        String method = trimmed.substring(0, separator).toUpperCase(Locale.ROOT);
        if (!HTTP_METHODS.contains(method)) {
            return true;
        }
        if (NOISE_METHODS.contains(method)) {
            return false;
        }
        String route = trimmed.substring(separator + 1).trim();
        return route.startsWith("/")
            && !"/".equals(route)
            && !"/api".equals(route)
            && !"/api/".equals(route)
            && !"/error".equals(route)
            && !route.contains("*");
    }

    static List<String> keepMeaningful(List<String> operations) {
        if (operations == null || operations.isEmpty()) {
            return List.of();
        }
        return operations.stream().filter(EndpointOperationFilter::isMeaningful).toList();
    }
}
