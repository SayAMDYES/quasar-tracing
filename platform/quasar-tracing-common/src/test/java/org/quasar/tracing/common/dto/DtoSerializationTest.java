package org.quasar.tracing.common.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Verifies the DTO classes serialize to the camelCase JSON field names the frontend
 * contract expects (Lombok getters + Jackson defaults).
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/06/08
 */
class DtoSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void traceSummarySerializesWithExpectedFieldNames() throws Exception {
        TraceSummaryDTO summary = new TraceSummaryDTO("abc", "web-gateway", "GET /x", 1000L,
                120_000_000L, 3, 1, "Error", "production", "ip-1",
                "pod-uid-1", "quasar-ns", "web-gateway-abc", "pod-uid-1", "node-1",
                List.of("web-gateway", "mysql"));

        String json = objectMapper.writeValueAsString(summary);

        assertThat(json).contains("\"traceId\":\"abc\"")
                .contains("\"durationNs\":\"120000000\"")
                .contains("\"startTime\":\"1000\"")
                .contains("\"k8sNamespace\":\"quasar-ns\"")
                .contains("\"status\":\"Error\"");
    }
}
