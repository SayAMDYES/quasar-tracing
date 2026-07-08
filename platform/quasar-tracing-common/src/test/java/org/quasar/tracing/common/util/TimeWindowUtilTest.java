package org.quasar.tracing.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Covers window-default resolution and the frontend-matching bucket steps.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
class TimeWindowUtilTest {

    @Test
    void resolvesDefaultLast24hWindow() {
        long before = System.currentTimeMillis();
        long to = TimeWindowUtil.resolveTo(null);
        long from = TimeWindowUtil.resolveFrom(null, to);
        assertThat(to - from).isEqualTo(24L * 3600 * 1000);
        assertThat(to).isGreaterThanOrEqualTo(before);
    }

    @Test
    void stepMatchesFrontendBuckets() {
        assertThat(TimeWindowUtil.stepSeconds(0L, 3600_000L)).isEqualTo(60);
        assertThat(TimeWindowUtil.stepSeconds(0L, 6L * 3600_000L)).isEqualTo(300);
        assertThat(TimeWindowUtil.stepSeconds(0L, 24L * 3600_000L)).isEqualTo(900);
        assertThat(TimeWindowUtil.stepSeconds(0L, 48L * 3600_000L)).isEqualTo(3600);
    }
}
