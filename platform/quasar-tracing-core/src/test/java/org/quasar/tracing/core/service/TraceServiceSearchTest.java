package org.quasar.tracing.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.quasar.tracing.clickhouse.mapper.LogMapper;
import org.quasar.tracing.clickhouse.mapper.SpanMapper;
import org.quasar.tracing.clickhouse.mapper.TraceMapper;
import org.quasar.tracing.clickhouse.mapper.TraceSearchFilter;
import org.quasar.tracing.common.dto.TraceAttributeConditionDTO;
import org.quasar.tracing.core.config.QueryProperties;
import org.quasar.tracing.core.exception.InvalidQueryException;

/**
 * Unit tests for {@link TraceService#search} with a mocked {@link TraceMapper}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
class TraceServiceSearchTest {

    private final TraceMapper mapper = Mockito.mock(TraceMapper.class);
    private final TraceService service = new TraceService(mapper,
        Mockito.mock(SpanMapper.class), Mockito.mock(LogMapper.class), new QueryProperties(50, 100, 1000));

    @Test
    void clampsLimitToMax() {
        when(mapper.search(any())).thenReturn(List.of());
        when(mapper.countSearch(any())).thenReturn(0L);

        service.search(null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null,
            null, null, 999_999, null);

        ArgumentCaptor<TraceSearchFilter> captor = ArgumentCaptor.forClass(TraceSearchFilter.class);
        verify(mapper).search(captor.capture());
        assertThat(captor.getValue().getLimit()).isEqualTo(1000);
    }

    @Test
    void defaultsWindowStatusAndLimit() {
        when(mapper.search(any())).thenReturn(List.of());
        when(mapper.countSearch(any())).thenReturn(0L);

        service.search(null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null,
            null, null, null, null);

        ArgumentCaptor<TraceSearchFilter> captor = ArgumentCaptor.forClass(TraceSearchFilter.class);
        verify(mapper).search(captor.capture());
        TraceSearchFilter filter = captor.getValue();
        assertThat(filter.getStatus()).isEqualTo("all");
        assertThat(filter.getLimit()).isEqualTo(50);
        assertThat(filter.getOffset()).isZero();
        assertThat(filter.getAttributeConditions()).isEmpty();
        assertThat(filter.getSpanSelector()).isNull();
        assertThat(filter.getTo()).isPositive();
        assertThat(filter.getFrom()).isLessThan(filter.getTo());
    }

    @Test
    void passesResourceDimensionFilters() {
        when(mapper.search(any())).thenReturn(List.of());
        when(mapper.countSearch(any())).thenReturn(0L);

        service.search("web-gateway", "GET /x", "error", "production", "quasar", "quasar-ns",
            "web-gateway-abc", "node-1", "pod-uid-1", null, null,
            0L, 120_000L, null, null, null, null, null, null,
            null, 50, 0);

        ArgumentCaptor<TraceSearchFilter> captor = ArgumentCaptor.forClass(TraceSearchFilter.class);
        verify(mapper).search(captor.capture());
        TraceSearchFilter filter = captor.getValue();
        assertThat(filter.getEnvironment()).isEqualTo("production");
        assertThat(filter.getNamespace()).isEqualTo("quasar");
        assertThat(filter.getK8sNamespace()).isEqualTo("quasar-ns");
        assertThat(filter.getServiceInstanceId()).isEqualTo("pod-uid-1");
    }

    @Test
    void passesAttributeConditions() {
        when(mapper.search(any())).thenReturn(List.of());
        when(mapper.countSearch(any())).thenReturn(0L);
        TraceAttributeConditionDTO condition =
            new TraceAttributeConditionDTO("span", "db.system", "equals", "mysql");

        service.search(null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, List.of(condition), null, null, null,
            null, null, null, null);

        ArgumentCaptor<TraceSearchFilter> captor = ArgumentCaptor.forClass(TraceSearchFilter.class);
        verify(mapper).search(captor.capture());
        assertThat(captor.getValue().getAttributeConditions()).containsExactly(condition);
    }

    @Test
    void normalizesSpanSelector() {
        when(mapper.search(any())).thenReturn(List.of());
        when(mapper.countSearch(any())).thenReturn(0L);

        service.search(null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null,
            " checkout ", " POST /orders ", " ERROR ", null, null, null, null);

        ArgumentCaptor<TraceSearchFilter> captor = ArgumentCaptor.forClass(TraceSearchFilter.class);
        verify(mapper).search(captor.capture());
        assertThat(captor.getValue().getSpanSelector())
            .extracting("service", "operation", "status")
            .containsExactly("checkout", "POST /orders", "error");
    }

    @Test
    void omitsSpanSelectorWhenAllValuesAreBlank() {
        when(mapper.search(any())).thenReturn(List.of());
        when(mapper.countSearch(any())).thenReturn(0L);

        service.search(null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null,
            "  ", "", null, null, null, null, null);

        ArgumentCaptor<TraceSearchFilter> captor = ArgumentCaptor.forClass(TraceSearchFilter.class);
        verify(mapper).search(captor.capture());
        assertThat(captor.getValue().getSpanSelector()).isNull();
    }

    @Test
    void rejectsUnknownSpanStatusBeforeMapperCall() {
        assertThatThrownBy(() -> service.search(null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null,
            null, null, "unknown", null, null, null, null))
            .isInstanceOf(InvalidQueryException.class)
            .hasMessage("Span status must be error or ok");

        verifyNoInteractions(mapper);
    }
}
