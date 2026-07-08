package org.quasar.tracing.clickhouse.handler;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

/**
 * MyBatis type handler for ClickHouse {@code Map(String, String)} columns.
 *
 * <p>The ClickHouse JDBC driver surfaces such columns as a {@link Map}; this handler
 * normalizes it into a {@code Map<String, String>} (insertion order preserved, null
 * values coerced to empty strings). Read-only — the platform never writes telemetry.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@MappedTypes(Map.class)
public class StringMapTypeHandler extends BaseTypeHandler<Map<String, String>> {

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, Map<String, String> parameter, JdbcType jdbcType)
            throws SQLException {
        ps.setObject(i, parameter);
    }

    @Override
    public Map<String, String> getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return convert(rs.getObject(columnName));
    }

    @Override
    public Map<String, String> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return convert(rs.getObject(columnIndex));
    }

    @Override
    public Map<String, String> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return convert(cs.getObject(columnIndex));
    }

    private static Map<String, String> convert(Object value) {
        if (value instanceof Map<?, ?> source) {
            Map<String, String> out = new LinkedHashMap<>();
            source.forEach((k, v) -> out.put(String.valueOf(k), v == null ? "" : String.valueOf(v)));
            return out;
        }
        return Collections.emptyMap();
    }
}
