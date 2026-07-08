package org.quasar.tracing.common.api;

import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Unified API response envelope: a status {@code code}, a human-readable {@code message},
 * and the typed {@code data} payload (null on failure). Every endpoint returns this shape.
 *
 * @param <T> the payload type
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Unified API response envelope")
public class QTResponse<T> implements Serializable {

    private static final long serialVersionUID = 1L;

    private static final int OK_CODE = 200;

    @Schema(description = "Status code; 200 on success", example = "200")
    private Integer code;

    @Schema(description = "Human-readable message", example = "OK")
    private String message;

    @Schema(description = "Payload; null on failure")
    private T data;

    public static <T> QTResponse<T> ok(T data) {
        return new QTResponse<>(OK_CODE, "OK", data);
    }

    public static <T> QTResponse<T> fail(Integer code, String message) {
        return new QTResponse<>(code, message, null);
    }
}
