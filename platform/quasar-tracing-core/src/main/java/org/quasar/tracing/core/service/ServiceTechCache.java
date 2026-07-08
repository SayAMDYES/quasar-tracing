package org.quasar.tracing.core.service;

import java.time.Clock;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Keeps service technology labels stable across short topology windows.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/06
 */
@Component
public class ServiceTechCache {

    private static final Duration TTL = Duration.ofHours(6);
    private static final Map<String, Integer> PRIORITY = Map.of(
        "Spring", 30,
        "Java", 20,
        "Go", 20
    );

    private final Map<String, Entry> cache = new ConcurrentHashMap<>();
    private final Clock clock;

    public ServiceTechCache() {
        this(Clock.systemUTC());
    }

    ServiceTechCache(Clock clock) {
        this.clock = clock;
    }

    public String resolve(String serviceName, String observedTech) {
        if (!StringUtils.hasText(serviceName)) {
            return observedTech;
        }
        long now = clock.millis();
        String normalized = normalize(observedTech);
        Entry entry = cache.compute(serviceName, (name, current) -> next(current, normalized, now));
        return entry == null ? normalized : entry.tech();
    }

    private Entry next(Entry current, String observedTech, long now) {
        if (current != null && current.expiresAt() <= now) {
            current = null;
        }
        if (!StringUtils.hasText(observedTech)) {
            return current;
        }
        long expiresAt = now + TTL.toMillis();
        if (current == null || priority(observedTech) >= priority(current.tech())) {
            return new Entry(observedTech, expiresAt);
        }
        return new Entry(current.tech(), expiresAt);
    }

    private static int priority(String tech) {
        return PRIORITY.getOrDefault(tech, 10);
    }

    private static String normalize(String tech) {
        if (!StringUtils.hasText(tech)) {
            return tech;
        }
        String lower = tech.trim().toLowerCase(Locale.ROOT);
        return switch (lower) {
            case "spring" -> "Spring";
            case "java" -> "Java";
            case "go" -> "Go";
            default -> tech.trim();
        };
    }

    private record Entry(String tech, long expiresAt) {
    }
}
