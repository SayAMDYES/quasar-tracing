package org.quasar.tracing.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * Boundary tests for Archive defaults and retention limits.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
class ArchivePropertiesTest {

    @Test
    void defaultsToDisabledWithReviewedLimits() {
        ArchiveProperties properties = new ArchiveProperties(null, null, null);

        assertThat(properties.isEnabled()).isFalse();
        assertThat(properties.retentionDays()).isEqualTo(180);
        assertThat(properties.maxSpansPerTrace()).isEqualTo(20_000);
    }

    @Test
    void acceptsRetentionBoundaryAndRejectsValuesOutsideIt() {
        assertThat(new ArchiveProperties(true, 30, 1).retentionDays()).isEqualTo(30);
        assertThat(new ArchiveProperties(true, 3650, 20_000).retentionDays()).isEqualTo(3650);
        assertThatThrownBy(() -> new ArchiveProperties(true, 29, 20_000))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("ARCHIVE_RETENTION_DAYS_OUT_OF_RANGE");
        assertThatThrownBy(() -> new ArchiveProperties(true, 3651, 20_000))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("ARCHIVE_RETENTION_DAYS_OUT_OF_RANGE");
    }

    @Test
    void rejectsArchiveSpanLimitsOutsideTheDocumentContract() {
        assertThatThrownBy(() -> new ArchiveProperties(true, 180, 0))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("ARCHIVE_MAX_SPANS_OUT_OF_RANGE");
        assertThatThrownBy(() -> new ArchiveProperties(true, 180, 20_001))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("ARCHIVE_MAX_SPANS_OUT_OF_RANGE");
    }
}
