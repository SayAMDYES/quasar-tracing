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
 * SQL-shape tests for infrastructure dependencies derived from Client Span semantics.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/08/23
 */
class ServiceMapperInfrastructureContractTest {

    @Test
    void derivesBoundedInfrastructureTargetsWithoutReadingSensitiveDatabaseFields() throws Exception {
        Configuration configuration = loadMapper();
        BoundSql boundSql = configuration.getMappedStatement(
                "org.quasar.tracing.clickhouse.mapper.ServiceMapper.selectEdges")
                .getBoundSql(Map.of("from", 1L, "to", 2L));
        String sql = boundSql.getSql().replaceAll("\\s+", " ").trim();

        assertThat(sql)
                .contains("UNION ALL")
                .contains("SpanKind = 'Client'")
                .contains("SpanAttributes['db.system']")
                .contains("SpanAttributes['db.system.name']")
                .contains("SpanAttributes['messaging.system']")
                .contains("SpanAttributes['server.address']")
                .contains("substringUTF8(")
                .contains("AS calleeType")
                .contains("AS calleeTech")
                .doesNotContain("db.statement")
                .doesNotContain("db.connection_string")
                .doesNotContain("db.user");
    }

    private static Configuration loadMapper() throws Exception {
        Configuration configuration = new Configuration();
        String resource = "mapper/ServiceMapper.xml";
        try (Reader reader = Resources.getResourceAsReader(resource)) {
            new XMLMapperBuilder(reader, configuration, resource, configuration.getSqlFragments()).parse();
        }
        return configuration;
    }
}
