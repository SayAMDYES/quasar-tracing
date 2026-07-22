package org.quasar.tracing.core.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Feature gate and retention limits for the optional Trace Archive.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
@ConfigurationProperties(prefix = "quasar.tracing.archive")
public record ArchiveProperties(Boolean enabled, Integer retentionDays, Integer maxSpansPerTrace) {

    public ArchiveProperties {
        enabled = Boolean.TRUE.equals(enabled);
        retentionDays = retentionDays == null ? 180 : retentionDays;
        maxSpansPerTrace = maxSpansPerTrace == null ? 20_000 : maxSpansPerTrace;
        if (retentionDays < 30 || retentionDays > 3650) {
            throw new IllegalArgumentException("ARCHIVE_RETENTION_DAYS_OUT_OF_RANGE");
        }
        if (maxSpansPerTrace <= 0 || maxSpansPerTrace > 20_000) {
            throw new IllegalArgumentException("ARCHIVE_MAX_SPANS_OUT_OF_RANGE");
        }
    }

    public boolean isEnabled() {
        return enabled;
    }
}
