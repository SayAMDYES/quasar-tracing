package org.quasar.tracing.core.exception;

/**
 * Stable conflict raised when an Archive generation cannot be safely activated.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
public class ArchiveConflictException extends RuntimeException {

    public ArchiveConflictException(String message) {
        super(message);
    }

    public ArchiveConflictException(String message, Throwable cause) {
        super(message, cause);
    }
}
