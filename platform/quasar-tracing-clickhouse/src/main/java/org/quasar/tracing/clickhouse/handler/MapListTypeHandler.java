package org.quasar.tracing.clickhouse.handler;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Array;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

/**
 * MyBatis type handler for the per-event attribute maps of a span, mapped to
 * {@code List<Map<String, String>>} (one map per span event).
 *
 * <p>The query exposes the column as an {@code Array(String)} of JSON objects
 * (via {@code arrayMap(m -> toJSONString(m), Events.Attributes)}) rather than the native
 * {@code Array(Map(...))}: the ClickHouse JDBC driver cannot materialize an array of maps
 * and throws {@code array element type mismatch} as soon as a span carries a populated
 * event — e.g. the agent's {@code exception} event on an error span. Each element is parsed
 * back into a {@code Map<String, String>} here. Read-only.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/09
 */
public class MapListTypeHandler extends BaseTypeHandler<List<Map<String, String>>> {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final TypeReference<LinkedHashMap<String, String>> MAP_TYPE = new TypeReference<>() {
    };

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, List<Map<String, String>> parameter, JdbcType jdbcType)
            throws SQLException {
        ps.setObject(i, parameter);
    }

    @Override
    public List<Map<String, String>> getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return convert(rs.getObject(columnName));
    }

    @Override
    public List<Map<String, String>> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return convert(rs.getObject(columnIndex));
    }

    @Override
    public List<Map<String, String>> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return convert(cs.getObject(columnIndex));
    }

    private static List<Map<String, String>> convert(Object value) throws SQLException {
        Object array = (value instanceof java.sql.Array sqlArray) ? sqlArray.getArray() : value;
        if (array == null) {
            return Collections.emptyList();
        }
        if (array instanceof List<?> list) {
            List<Map<String, String>> out = new ArrayList<>(list.size());
            for (Object element : list) {
                out.add(toStringMap(element));
            }
            return out;
        }
        if (array.getClass().isArray()) {
            int length = Array.getLength(array);
            List<Map<String, String>> out = new ArrayList<>(length);
            for (int i = 0; i < length; i++) {
                out.add(toStringMap(Array.get(array, i)));
            }
            return out;
        }
        return Collections.emptyList();
    }

    private static Map<String, String> toStringMap(Object element) {
        if (element instanceof CharSequence json) {
            return parseJson(json.toString());
        }
        // Defensive: tolerate a native Map should the driver ever surface one directly.
        if (element instanceof Map<?, ?> source) {
            Map<String, String> out = new LinkedHashMap<>();
            source.forEach((k, v) -> out.put(String.valueOf(k), v == null ? "" : String.valueOf(v)));
            return out;
        }
        return Collections.emptyMap();
    }

    private static Map<String, String> parseJson(String json) {
        if (json.isBlank()) {
            return Collections.emptyMap();
        }
        try {
            return OBJECT_MAPPER.readValue(json, MAP_TYPE);
        } catch (JsonProcessingException e) {
            return Collections.emptyMap();
        }
    }
}
