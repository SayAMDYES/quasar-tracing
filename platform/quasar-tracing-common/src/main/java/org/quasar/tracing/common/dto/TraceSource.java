package org.quasar.tracing.common.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/**
 * Source used to read a trace document.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
public enum TraceSource {

    AUTO,
    LIVE,
    ARCHIVE;

    @JsonCreator
    public static TraceSource fromValue(String value) {
        if (value == null) {
            throw new IllegalArgumentException("INVALID_TRACE_SOURCE");
        }
        try {
            return valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("INVALID_TRACE_SOURCE", exception);
        }
    }

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}
