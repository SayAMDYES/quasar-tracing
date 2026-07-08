package org.quasar.tracing.clickhouse.handler;

import java.lang.reflect.Array;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

/**
 * MyBatis type handler for ClickHouse numeric and temporal array columns (e.g.
 * {@code Array(Int64)}, {@code Array(DateTime64)}) mapped to {@code List<Long>}.
 * Temporal elements become epoch milliseconds ({@code LocalDateTime} interpreted as
 * UTC, matching the server timezone). Referenced explicitly via {@code typeHandler=}
 * in result maps. Read-only — the platform never writes telemetry.
 *
 * <p>Tolerates whatever the driver hands back for an array column: {@link java.sql.Array},
 * an object array, a primitive array, or a {@link List}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
public class LongListTypeHandler extends BaseTypeHandler<List<Long>> {

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, List<Long> parameter, JdbcType jdbcType)
            throws SQLException {
        ps.setObject(i, parameter);
    }

    @Override
    public List<Long> getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return convert(rs.getObject(columnName));
    }

    @Override
    public List<Long> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return convert(rs.getObject(columnIndex));
    }

    @Override
    public List<Long> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return convert(cs.getObject(columnIndex));
    }

    private static List<Long> convert(Object value) throws SQLException {
        Object array = (value instanceof java.sql.Array sqlArray) ? sqlArray.getArray() : value;
        if (array == null) {
            return Collections.emptyList();
        }
        if (array instanceof List<?> list) {
            List<Long> out = new ArrayList<>(list.size());
            for (Object element : list) {
                out.add(toLong(element));
            }
            return out;
        }
        if (array.getClass().isArray()) {
            int length = Array.getLength(array);
            List<Long> out = new ArrayList<>(length);
            for (int i = 0; i < length; i++) {
                out.add(toLong(Array.get(array, i)));
            }
            return out;
        }
        return Collections.emptyList();
    }

    private static Long toLong(Object element) {
        if (element == null) {
            return 0L;
        }
        if (element instanceof Number number) {
            return number.longValue();
        }
        if (element instanceof ZonedDateTime zoned) {
            return zoned.toInstant().toEpochMilli();
        }
        if (element instanceof OffsetDateTime offset) {
            return offset.toInstant().toEpochMilli();
        }
        if (element instanceof LocalDateTime local) {
            return local.toInstant(ZoneOffset.UTC).toEpochMilli();
        }
        if (element instanceof Instant instant) {
            return instant.toEpochMilli();
        }
        if (element instanceof Date date) {
            return date.getTime();
        }
        return Long.parseLong(String.valueOf(element));
    }
}
