package org.quasar.tracing.clickhouse.handler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * Verifies {@link MapListTypeHandler} parses the JSON-encoded event-attribute array the
 * span query produces. A populated event (the agent's {@code exception} event) is what
 * crashed the trace-detail read path before the column was switched to {@code Array(String)}.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/15
 */
@ExtendWith(MockitoExtension.class)
class MapListTypeHandlerTest {

    @Mock
    private ResultSet resultSet;

    private final MapListTypeHandler handler = new MapListTypeHandler();

    @Test
    void parsesJsonEncodedEventAttributes() throws Exception {
        String[] column = {
            "{}",
            "{\"exception.type\":\"java.lang.IllegalStateException\",\"exception.message\":\"boom\"}"
        };
        when(resultSet.getObject("eventAttributes")).thenReturn(column);

        List<Map<String, String>> result = handler.getNullableResult(resultSet, "eventAttributes");

        assertThat(result).hasSize(2);
        assertThat(result.get(0)).isEmpty();
        assertThat(result.get(1))
            .containsEntry("exception.type", "java.lang.IllegalStateException")
            .containsEntry("exception.message", "boom");
    }

    @Test
    void returnsEmptyListWhenColumnNull() throws Exception {
        when(resultSet.getObject("eventAttributes")).thenReturn(null);

        assertThat(handler.getNullableResult(resultSet, "eventAttributes")).isEmpty();
    }
}
