package org.quasar.tracing.clickhouse.handler;

import java.sql.Array;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

/**
 * MyBatis type handler for ClickHouse {@code Array(String)} columns.
 *
 * <p>The ClickHouse JDBC driver may surface an array column as a {@link Array}, a raw
 * {@code Object[]}, or a {@link List}; this handler normalizes any of those into a
 * {@code List<String>}. Read-only — the platform never writes telemetry.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
@MappedTypes(List.class)
public class StringListTypeHandler extends BaseTypeHandler<List<String>> {

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, List<String> parameter, JdbcType jdbcType)
            throws SQLException {
        ps.setObject(i, parameter);
    }

    @Override
    public List<String> getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return convert(rs.getObject(columnName));
    }

    @Override
    public List<String> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return convert(rs.getObject(columnIndex));
    }

    @Override
    public List<String> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return convert(cs.getObject(columnIndex));
    }

    private static List<String> convert(Object value) throws SQLException {
        if (value instanceof Array array) {
            return toList((Object[]) array.getArray());
        }
        if (value instanceof Object[] elements) {
            return toList(elements);
        }
        if (value instanceof List<?> list) {
            List<String> out = new ArrayList<>(list.size());
            list.forEach(element -> out.add(String.valueOf(element)));
            return out;
        }
        return Collections.emptyList();
    }

    private static List<String> toList(Object[] elements) {
        List<String> out = new ArrayList<>(elements.length);
        for (Object element : elements) {
            out.add(String.valueOf(element));
        }
        return out;
    }
}
