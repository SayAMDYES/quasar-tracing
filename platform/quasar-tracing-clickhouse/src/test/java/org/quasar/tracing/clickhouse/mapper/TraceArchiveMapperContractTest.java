package org.quasar.tracing.clickhouse.mapper;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.Reader;
import java.util.Map;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.io.Resources;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;

/**
 * SQL-shape tests for the fixed Archive mapper branches.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/22
 */
class TraceArchiveMapperContractTest {

    @Test
    void definesOneCrossPartitionLatestRuleWithoutEngineReplacement() throws Exception {
        String xml;
        try (Reader reader = Resources.getResourceAsReader("mapper/TraceArchiveMapper.xml")) {
            StringBuilder value = new StringBuilder();
            char[] buffer = new char[4096];
            int count;
            while ((count = reader.read(buffer)) >= 0) {
                value.append(buffer, 0, count);
            }
            xml = value.toString();
        }

        assertThat(xml).contains("<sql id=\"latestArchiveManifest\">")
                .contains("argMax(")
                .contains("tuple(Revision, UpdatedAt, RevisionId)")
                .doesNotContain("FINAL")
                .doesNotContain("${table}");
        assertThat(count(xml, "argMax(")).isOne();
    }

    @Test
    void bindsTraceIdsAndLocksSearchToTheWinningActiveGeneration() throws Exception {
        Configuration configuration = loadMapper();
        BoundSql latest = configuration.getMappedStatement(
                "org.quasar.tracing.clickhouse.mapper.TraceArchiveMapper.selectLatest")
                .getBoundSql(Map.of("traceId", "trace-1"));
        assertThat(sql(latest)).contains("WHERE traceId = ?")
                .doesNotContain("FINAL");
        assertThat(latest.getParameterMappings()).extracting("property")
                .containsExactly("traceId");

        TraceSearchFilter filter = new TraceSearchFilter();
        filter.setFrom(1L);
        filter.setTo(2L);
        filter.setStatus("all");
        filter.setLimit(100);
        filter.setOffset(0);
        BoundSql search = configuration.getMappedStatement(
                "org.quasar.tracing.clickhouse.mapper.TraceArchiveMapper.search")
                .getBoundSql(filter);
        assertThat(sql(search))
                .contains("m.state = 'ACTIVE'")
                .contains("m.generation = toString(s.ArchiveGeneration)")
                .contains("m.expiresAt > toUnixTimestamp64Milli(now64(3))")
                .contains("LIMIT 100 OFFSET 0")
                .doesNotContain("${table}");
    }

    @Test
    void readsAndCleansOnlyTheRequestedImmutableGeneration() throws Exception {
        Configuration configuration = loadMapper();
        Map<String, Object> parameters = Map.of("traceId", "trace-1", "generation", "generation-1");
        BoundSql read = configuration.getMappedStatement(
                "org.quasar.tracing.clickhouse.mapper.TraceArchiveMapper.selectGeneration")
                .getBoundSql(parameters);
        BoundSql cleanup = configuration.getMappedStatement(
                "org.quasar.tracing.clickhouse.mapper.TraceArchiveMapper.cleanupGeneration")
                .getBoundSql(parameters);

        assertThat(sql(read)).contains("TraceId = ?", "ArchiveGeneration = toUUID(?)");
        assertThat(sql(cleanup)).contains("DELETE WHERE TraceId = ?", "ArchiveGeneration = toUUID(?)");
    }

    private static Configuration loadMapper() throws Exception {
        Configuration configuration = new Configuration();
        String resource = "mapper/TraceArchiveMapper.xml";
        try (Reader reader = Resources.getResourceAsReader(resource)) {
            new XMLMapperBuilder(reader, configuration, resource, configuration.getSqlFragments()).parse();
        }
        return configuration;
    }

    private static String sql(BoundSql boundSql) {
        return boundSql.getSql().replaceAll("\\s+", " ").trim();
    }

    private static int count(String value, String needle) {
        int matches = 0;
        int offset = 0;
        while ((offset = value.indexOf(needle, offset)) >= 0) {
            matches++;
            offset += needle.length();
        }
        return matches;
    }
}
