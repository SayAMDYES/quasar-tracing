package org.quasar.tracing.common.util;

/**
 * Helpers for resolving query time windows (epoch milliseconds) and choosing chart
 * bucket sizes that match the frontend's {@code pickStep}, so server-rendered series
 * align with the charts. Stateless; not instantiable.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
public final class TimeWindowUtil {

    private static final long DAY_MS = 24L * 3600 * 1000;

    private TimeWindowUtil() {
    }

    /** Resolves the window end: the given value, or "now" when null. */
    public static Long resolveTo(Long to) {
        return to != null ? to : System.currentTimeMillis();
    }

    /** Resolves the window start: the given value, or 24h before {@code to} when null. */
    public static Long resolveFrom(Long from, Long to) {
        return from != null ? from : to - DAY_MS;
    }

    /** Bucket size in seconds for a window: 60 (≤1h), 300 (≤6h), 900 (≤24h), else 3600. */
    public static Integer stepSeconds(Long fromMs, Long toMs) {
        long span = toMs - fromMs;
        if (span <= 3600_000L) {
            return 60;
        }
        if (span <= 6L * 3600_000L) {
            return 300;
        }
        if (span <= DAY_MS) {
            return 900;
        }
        return 3600;
    }

    /** Bucket size in milliseconds. */
    public static Long stepMs(Long fromMs, Long toMs) {
        return stepSeconds(fromMs, toMs) * 1000L;
    }
}
