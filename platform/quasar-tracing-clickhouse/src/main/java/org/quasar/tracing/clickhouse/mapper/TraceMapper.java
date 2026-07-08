package org.quasar.tracing.clickhouse.mapper;

import java.util.List;
import org.quasar.tracing.clickhouse.entity.TraceSummaryEntity;

/**
 * Trace search over the {@code spans} detail table: spans grouped by {@code TraceId}
 * into list-view summaries. SQL lives in {@code resources/mapper/TraceMapper.xml}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
public interface TraceMapper {

    /**
     * @param filter normalized search inputs
     * @return one page of trace summaries, ordered and paged per the filter
     */
    List<TraceSummaryEntity> search(TraceSearchFilter filter);

    /**
     * @param filter the same filter passed to {@link #search}
     * @return total matching traces (ignoring limit/offset)
     */
    Long countSearch(TraceSearchFilter filter);
}
