package org.quasar.tracing.clickhouse.mapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.Reader;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.io.Resources;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.ResultMap;
import org.apache.ibatis.mapping.ResultMapping;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;
import org.quasar.tracing.clickhouse.entity.SpanEntity;
import org.quasar.tracing.clickhouse.handler.LongListTypeHandler;
import org.quasar.tracing.clickhouse.handler.MapListTypeHandler;
import org.quasar.tracing.clickhouse.handler.StringListTypeHandler;

/**
 * Contract tests for the stored span fields required by trace documents.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/19
 */
class SpanMapperDocumentTest {

    @Test
    void selectsEveryStoredDocumentFieldWithoutChangingLegacyProjections() throws Exception {
        Configuration configuration = loadMapper();
        MappedStatement statement = configuration.getMappedStatement(
                "org.quasar.tracing.clickhouse.mapper.SpanMapper.selectByTraceId");
        String sql = statement.getBoundSql(Map.of("traceId", "trace-1"))
                .getSql()
                .replaceAll("\\s+", " ")
                .trim();

        assertThat(sql)
                .contains("toUnixTimestamp64Milli(Timestamp) AS timestamp")
                .contains("Duration AS duration")
                .contains("TraceState AS traceState")
                .contains("ScopeName AS scopeName")
                .contains("ScopeVersion AS scopeVersion")
                .contains("toString(toUnixTimestamp64Nano(Timestamp)) AS startTimeUnixNano")
                .contains("toString(Duration) AS durationNano")
                .contains("Events.Name AS eventNames")
                .contains("arrayMap(x -> toUnixTimestamp64Milli(x), Events.Timestamp) AS eventTimestamps")
                .contains("arrayMap(x -> toString(toUnixTimestamp64Nano(x)), Events.Timestamp) AS eventTimeUnixNanos")
                .contains("arrayMap(m -> toJSONString(m), Events.Attributes) AS eventAttributes")
                .contains("Links.TraceId AS linkTraceIds")
                .contains("Links.SpanId AS linkSpanIds")
                .contains("Links.TraceState AS linkTraceStates")
                .contains("arrayMap(m -> toJSONString(m), Links.Attributes) AS linkAttributes");
    }

    @Test
    void mapsDocumentArraysWithJdbcCompatibleTypeHandlers() throws Exception {
        ResultMap resultMap = loadMapper().getResultMap(
                "org.quasar.tracing.clickhouse.mapper.SpanMapper.spanResultMap");

        assertTypeHandler(resultMap, "eventNames", StringListTypeHandler.class);
        assertTypeHandler(resultMap, "eventTimestamps", LongListTypeHandler.class);
        assertTypeHandler(resultMap, "eventTimeUnixNanos", StringListTypeHandler.class);
        assertTypeHandler(resultMap, "eventAttributes", MapListTypeHandler.class);
        assertTypeHandler(resultMap, "linkTraceIds", StringListTypeHandler.class);
        assertTypeHandler(resultMap, "linkSpanIds", StringListTypeHandler.class);
        assertTypeHandler(resultMap, "linkTraceStates", StringListTypeHandler.class);
        assertTypeHandler(resultMap, "linkAttributes", MapListTypeHandler.class);
    }

    @Test
    void acceptsAlignedAndNullDocumentArrays() {
        SpanEntity aligned = new SpanEntity();
        aligned.setEventNames(List.of("exception"));
        aligned.setEventTimeUnixNanos(List.of("1752890000000000000"));
        aligned.setEventAttributes(List.of(Map.of("exception.type", "java.lang.IllegalStateException")));
        aligned.setLinkTraceIds(List.of("trace-2"));
        aligned.setLinkSpanIds(List.of("span-2"));
        aligned.setLinkTraceStates(List.of("vendor=value"));
        aligned.setLinkAttributes(List.of(Map.of("link.type", "follows_from")));

        assertThatCode(aligned::validateDocumentArrays).doesNotThrowAnyException();
        assertThatCode(new SpanEntity()::validateDocumentArrays).doesNotThrowAnyException();
    }

    @Test
    void rejectsMismatchedEventDocumentArraysWithStableError() {
        SpanEntity span = new SpanEntity();
        span.setEventNames(List.of("exception"));
        span.setEventTimeUnixNanos(List.of());
        span.setEventAttributes(List.of(Map.of()));

        assertThatThrownBy(span::validateDocumentArrays)
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("INVALID_STORED_SPAN_ARRAYS: event arrays have inconsistent lengths");
    }

    @Test
    void rejectsMismatchedLinkDocumentArraysWithStableError() {
        SpanEntity span = new SpanEntity();
        span.setLinkTraceIds(List.of("trace-2"));
        span.setLinkSpanIds(List.of("span-2"));
        span.setLinkTraceStates(List.of());
        span.setLinkAttributes(List.of(Map.of()));

        assertThatThrownBy(span::validateDocumentArrays)
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("INVALID_STORED_SPAN_ARRAYS: link arrays have inconsistent lengths");
    }

    private static Configuration loadMapper() throws Exception {
        Configuration configuration = new Configuration();
        String resource = "mapper/SpanMapper.xml";
        try (Reader reader = Resources.getResourceAsReader(resource)) {
            new XMLMapperBuilder(reader, configuration, resource, configuration.getSqlFragments()).parse();
        }
        return configuration;
    }

    private static void assertTypeHandler(ResultMap resultMap, String property, Class<?> typeHandler) {
        ResultMapping mapping = resultMap.getResultMappings().stream()
                .filter(candidate -> property.equals(candidate.getProperty()))
                .findFirst()
                .orElseThrow();
        assertThat(mapping.getTypeHandler()).isInstanceOf(typeHandler);
    }
}
