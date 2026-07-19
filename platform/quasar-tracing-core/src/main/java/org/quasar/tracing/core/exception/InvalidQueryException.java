package org.quasar.tracing.core.exception;

/**
 * Raised when query parameters cannot be safely normalized into a supported query.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/18
 */
public class InvalidQueryException extends RuntimeException {

    public InvalidQueryException(String message) {
        super(message);
    }
}
