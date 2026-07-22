package org.quasar.tracing.server.advice;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.quasar.tracing.common.api.QTResponse;

/**
 * Unit tests for {@link GlobalExceptionHandler}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
class GlobalExceptionHandlerTest {

    @Test
    void returnsUnhandledException() {
        QTResponse<Void> response = new GlobalExceptionHandler()
            .internalError(new IllegalStateException("connection refused"));

        assertEquals(500, response.getCode());
        assertEquals("java.lang.IllegalStateException: connection refused", response.getMessage());
    }
}
