package org.quasar.tracing.core.exception;

/**
 * Thrown by services when a requested resource (trace, service, …) does not exist;
 * the web layer renders it as a {@code 404} with a {@code {"message": …}} body.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }
}
