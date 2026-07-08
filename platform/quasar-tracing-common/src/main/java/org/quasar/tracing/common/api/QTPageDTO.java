package org.quasar.tracing.common.api;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Paged payload carried inside {@link QTResponse}: 1-based {@code current} page, page
 * {@code size}, {@code total} matching rows, and the {@code records} on this page.
 *
 * @param <T> the record type
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Paged result payload")
public class QTPageDTO<T> implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "Current page number, 1-based", example = "1")
    private Integer current;

    @Schema(description = "Page size", example = "50")
    private Integer size;

    @Schema(description = "Total matching rows", example = "150")
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long total;

    @Schema(description = "Records on the current page")
    private List<T> records;

    /**
     * Builds a page from limit/offset inputs, deriving the 1-based current page and size.
     *
     * @param records the rows on this page
     * @param total   total matching rows (ignoring paging)
     * @param limit   page size requested
     * @param offset  row offset requested
     * @return the assembled page
     */
    public static <T> QTPageDTO<T> of(List<T> records, Long total, Integer limit, Integer offset) {
        Integer size = (limit == null || limit <= 0) ? records.size() : limit;
        Integer current = (size == null || size <= 0) ? 1 : (offset / size) + 1;
        return new QTPageDTO<>(current, size, total, records);
    }
}
