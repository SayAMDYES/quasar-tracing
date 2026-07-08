package org.quasar.tracing.core.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Query limits for the read API: default page sizes and the hard cap applied to
 * any client-supplied {@code limit}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
@ConfigurationProperties(prefix = "quasar.tracing.query")
public record QueryProperties(Integer defaultTraceLimit, Integer defaultLogLimit, Integer maxLimit) {

    public QueryProperties {
        if (defaultTraceLimit == null || defaultTraceLimit <= 0) {
            defaultTraceLimit = 50;
        }
        if (defaultLogLimit == null || defaultLogLimit <= 0) {
            defaultLogLimit = 100;
        }
        if (maxLimit == null || maxLimit <= 0) {
            maxLimit = 1000;
        }
    }

    /** Effective limit: fall back when missing/invalid, never exceed {@code maxLimit}. */
    public Integer clamp(Integer limit, Integer fallback) {
        int effective = (limit == null || limit <= 0) ? fallback : limit;
        return Math.min(effective, maxLimit);
    }
}
