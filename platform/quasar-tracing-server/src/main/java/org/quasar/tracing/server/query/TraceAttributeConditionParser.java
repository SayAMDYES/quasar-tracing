package org.quasar.tracing.server.query;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.quasar.tracing.common.dto.TraceAttributeConditionDTO;
import org.quasar.tracing.core.exception.InvalidQueryException;
import org.springframework.stereotype.Component;

/**
 * Parses and validates structured Resource and Span Attribute query conditions.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/18
 */
@Component
@RequiredArgsConstructor
public class TraceAttributeConditionParser {

    private static final int RAW_MAX = 4096;
    private static final int MAX_CONDITIONS = 5;
    private static final int KEY_MAX = 128;
    private static final int VALUE_MAX = 512;
    private static final Set<String> ALLOWED_FIELDS = Set.of("scope", "key", "operator", "value");
    private static final Set<String> SCOPES = Set.of("resource", "span");
    private static final Set<String> OPERATORS = Set.of("equals", "contains", "exists");
    private static final TypeReference<List<TraceAttributeConditionDTO>> CONDITION_LIST_TYPE =
        new TypeReference<>() {
        };

    private final ObjectMapper objectMapper;

    public List<TraceAttributeConditionDTO> parse(String raw) {
        if (raw == null) {
            return List.of();
        }
        if (raw.length() > RAW_MAX) {
            throw new InvalidQueryException("Attribute conditions exceed the maximum length of " + RAW_MAX);
        }
        if (raw.isBlank()) {
            return List.of();
        }

        JsonNode root = readTree(raw);
        if (!root.isArray()) {
            throw new InvalidQueryException("Attribute conditions must be a JSON array");
        }
        if (root.size() > MAX_CONDITIONS) {
            throw new InvalidQueryException("At most " + MAX_CONDITIONS + " attribute conditions are allowed");
        }

        validateNodeTypes(root);
        List<TraceAttributeConditionDTO> parsed = convert(root);
        List<TraceAttributeConditionDTO> normalized = new ArrayList<>(parsed.size());
        Set<ConditionKey> uniqueConditions = new HashSet<>();
        for (int i = 0; i < parsed.size(); i++) {
            TraceAttributeConditionDTO condition = normalize(parsed.get(i), i);
            ConditionKey conditionKey = new ConditionKey(
                condition.getScope(), condition.getKey(), condition.getOperator(), condition.getValue());
            if (!uniqueConditions.add(conditionKey)) {
                throw invalidCondition(i, "duplicates another condition");
            }
            normalized.add(condition);
        }
        return List.copyOf(normalized);
    }

    private JsonNode readTree(String raw) {
        try {
            return objectMapper.readTree(raw);
        } catch (JsonProcessingException e) {
            throw new InvalidQueryException("Attribute conditions must be valid JSON");
        }
    }

    private void validateNodeTypes(JsonNode root) {
        for (int i = 0; i < root.size(); i++) {
            JsonNode condition = root.get(i);
            if (condition == null || condition.isNull()) {
                throw invalidCondition(i, "must not be null");
            }
            if (!condition.isObject()) {
                throw invalidCondition(i, "must be a JSON object");
            }
            Iterator<String> fieldNames = condition.fieldNames();
            while (fieldNames.hasNext()) {
                String fieldName = fieldNames.next();
                if (!ALLOWED_FIELDS.contains(fieldName)) {
                    throw invalidCondition(i, "contains unsupported field: " + fieldName);
                }
            }
            requireText(condition, "scope", i);
            requireText(condition, "key", i);
            requireText(condition, "operator", i);

            JsonNode operatorNode = condition.get("operator");
            String operator = operatorNode.textValue().trim().toLowerCase(Locale.ROOT);
            JsonNode valueNode = condition.get("value");
            if ("equals".equals(operator) || "contains".equals(operator)) {
                if (valueNode == null || !valueNode.isTextual()) {
                    throw invalidCondition(i, "value must be a JSON string for " + operator);
                }
            } else if (valueNode != null && !valueNode.isNull() && !valueNode.isTextual()) {
                throw invalidCondition(i, "value must be empty for exists");
            }
        }
    }

    private void requireText(JsonNode condition, String field, int index) {
        JsonNode value = condition.get(field);
        if (value == null || !value.isTextual()) {
            throw invalidCondition(index, field + " must be a JSON string");
        }
    }

    private List<TraceAttributeConditionDTO> convert(JsonNode root) {
        try {
            return objectMapper.convertValue(root, CONDITION_LIST_TYPE);
        } catch (IllegalArgumentException e) {
            throw new InvalidQueryException("Attribute conditions contain unsupported fields or values");
        }
    }

    private TraceAttributeConditionDTO normalize(TraceAttributeConditionDTO condition, int index) {
        String scope = condition.getScope().trim().toLowerCase(Locale.ROOT);
        if (!SCOPES.contains(scope)) {
            throw invalidCondition(index, "scope must be resource or span");
        }

        String operator = condition.getOperator().trim().toLowerCase(Locale.ROOT);
        if (!OPERATORS.contains(operator)) {
            throw invalidCondition(index, "operator must be equals, contains, or exists");
        }

        String key = condition.getKey().trim();
        if (key.isEmpty() || key.length() > KEY_MAX) {
            throw invalidCondition(index, "key length must be between 1 and " + KEY_MAX);
        }

        String value = condition.getValue();
        if ("equals".equals(operator) || "contains".equals(operator)) {
            if (value == null) {
                throw invalidCondition(index, "value is required for " + operator);
            }
            if (value.length() > VALUE_MAX) {
                throw invalidCondition(index, "value length must not exceed " + VALUE_MAX);
            }
        } else {
            if (value != null && !value.isEmpty()) {
                throw invalidCondition(index, "value must be empty for exists");
            }
            value = null;
        }

        return new TraceAttributeConditionDTO(scope, key, operator, value);
    }

    private InvalidQueryException invalidCondition(int index, String message) {
        return new InvalidQueryException("Attribute condition " + (index + 1) + " " + message);
    }

    private record ConditionKey(String scope, String key, String operator, String value) {
    }
}
