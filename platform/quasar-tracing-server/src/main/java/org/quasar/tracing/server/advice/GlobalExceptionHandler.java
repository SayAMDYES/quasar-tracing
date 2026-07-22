package org.quasar.tracing.server.advice;

import org.quasar.tracing.common.api.QTResponse;
import org.quasar.tracing.core.exception.InvalidQueryException;
import org.quasar.tracing.core.exception.NotFoundException;
import org.quasar.tracing.core.exception.TraceDocumentTooLargeException;
import org.quasar.tracing.core.exception.ArchiveConflictException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Translates exceptions into the {@link QTResponse} error envelope so the
 * application never returns a raw stack trace or stops on unhandled errors.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(InvalidQueryException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public QTResponse<Void> invalidQuery(InvalidQueryException e) {
        return QTResponse.fail(HttpStatus.BAD_REQUEST.value(), e.getMessage());
    }

    @ExceptionHandler(NotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public QTResponse<Void> notFound(NotFoundException e) {
        return QTResponse.fail(HttpStatus.NOT_FOUND.value(), e.getMessage());
    }

    @ExceptionHandler(TraceDocumentTooLargeException.class)
    @ResponseStatus(HttpStatus.PAYLOAD_TOO_LARGE)
    public QTResponse<Void> documentTooLarge(TraceDocumentTooLargeException e) {
        return QTResponse.fail(HttpStatus.PAYLOAD_TOO_LARGE.value(), e.getMessage());
    }

    @ExceptionHandler(ArchiveConflictException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public QTResponse<Void> archiveConflict(ArchiveConflictException e) {
        return QTResponse.fail(HttpStatus.CONFLICT.value(), e.getMessage());
    }

    @ExceptionHandler({MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public QTResponse<Void> badRequest(Exception e) {
        return QTResponse.fail(HttpStatus.BAD_REQUEST.value(), e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public QTResponse<Void> internalError(Exception e) {
        log.error("Unhandled exception", e);
        return QTResponse.fail(HttpStatus.INTERNAL_SERVER_ERROR.value(), "Internal Server Error");
    }
}
