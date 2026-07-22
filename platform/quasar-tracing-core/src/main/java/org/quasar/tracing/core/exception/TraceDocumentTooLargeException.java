package org.quasar.tracing.core.exception;

/**
 * Raised when a canonical trace document exceeds a v1 transport limit.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
public class TraceDocumentTooLargeException extends RuntimeException {

    public static final String ERROR_IDENTIFIER = "TRACE_DOCUMENT_TOO_LARGE";

    public TraceDocumentTooLargeException() {
        super(ERROR_IDENTIFIER);
    }
}
