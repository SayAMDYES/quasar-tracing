package org.quasar.tracing.core.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link ServiceTechCache}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/06
 */
class ServiceTechCacheTest {

    @Test
    void higherPriorityTechDoesNotDowngradeWithinTtl() {
        MutableClock clock = new MutableClock(Instant.parse("2026-07-06T00:00:00Z"));
        ServiceTechCache cache = new ServiceTechCache(clock);

        assertThat(cache.resolve("dumouse-home", "Spring")).isEqualTo("Spring");
        assertThat(cache.resolve("dumouse-home", "Java")).isEqualTo("Spring");
    }

    @Test
    void expiredTechCanBeLearnedAgain() {
        MutableClock clock = new MutableClock(Instant.parse("2026-07-06T00:00:00Z"));
        ServiceTechCache cache = new ServiceTechCache(clock);

        assertThat(cache.resolve("dumouse-home", "Spring")).isEqualTo("Spring");
        clock.advance(Duration.ofHours(7));

        assertThat(cache.resolve("dumouse-home", "Java")).isEqualTo("Java");
    }

    private static class MutableClock extends Clock {

        private Instant instant;

        MutableClock(Instant instant) {
            this.instant = instant;
        }

        void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
