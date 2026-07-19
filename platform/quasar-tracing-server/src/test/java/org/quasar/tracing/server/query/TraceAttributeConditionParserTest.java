package org.quasar.tracing.server.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.quasar.tracing.common.dto.TraceAttributeConditionDTO;
import org.quasar.tracing.core.exception.InvalidQueryException;

class TraceAttributeConditionParserTest {

    private final TraceAttributeConditionParser parser = new TraceAttributeConditionParser(new ObjectMapper());

    @Test
    void returnsEmptyListForNullOrBlankInput() {
        assertThat(parser.parse(null)).isEmpty();
        assertThat(parser.parse(" \t\r\n")).isEmpty();
    }

    @Test
    void normalizesResourceEqualsConditionAndPreservesValue() {
        List<TraceAttributeConditionDTO> result = parser.parse("""
            [{"scope":" RESOURCE ","key":" db.system ","operator":"EQUALS","value":" mysql "}]
            """);

        assertThat(result).extracting(
            TraceAttributeConditionDTO::getScope,
            TraceAttributeConditionDTO::getKey,
            TraceAttributeConditionDTO::getOperator,
            TraceAttributeConditionDTO::getValue
        ).containsExactly(tuple("resource", "db.system", "equals", " mysql "));
    }

    @Test
    void normalizesSpanContainsCondition() {
        List<TraceAttributeConditionDTO> result = parser.parse("""
            [{"scope":"span","key":"db.query.text","operator":"contains","value":"FROM users"}]
            """);

        assertThat(result).extracting(
            TraceAttributeConditionDTO::getScope,
            TraceAttributeConditionDTO::getKey,
            TraceAttributeConditionDTO::getOperator,
            TraceAttributeConditionDTO::getValue
        ).containsExactly(tuple("span", "db.query.text", "contains", "FROM users"));
    }

    @Test
    void normalizesMissingNullAndEmptyExistsValuesToNull() {
        List<TraceAttributeConditionDTO> result = parser.parse("""
            [
              {"scope":"span","key":"error.type","operator":"exists"},
              {"scope":"span","key":"exception.type","operator":"exists","value":null},
              {"scope":"resource","key":"service.version","operator":"exists","value":""}
            ]
            """);

        assertThat(result).extracting(TraceAttributeConditionDTO::getValue)
            .containsExactly(null, null, null);
    }

    @Test
    void rejectsUnknownFieldsWithLenientObjectMapper() {
        ObjectMapper lenientObjectMapper = new ObjectMapper()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        TraceAttributeConditionParser lenientParser = new TraceAttributeConditionParser(lenientObjectMapper);

        assertThatThrownBy(() -> lenientParser.parse("""
            [{"scope":"span","key":"db.system","operator":"equals","value":"mysql","valu":"typo"}]
            """)).isInstanceOf(InvalidQueryException.class);
    }

    @Test
    void rejectsMalformedJsonAndNonArrayPayloads() {
        assertThatThrownBy(() -> parser.parse("[{")).isInstanceOf(InvalidQueryException.class);
        assertThatThrownBy(() -> parser.parse("{\"scope\":\"span\"}"))
            .isInstanceOf(InvalidQueryException.class);
    }

    @Test
    void rejectsOversizedRawPayload() {
        assertThatThrownBy(() -> parser.parse(" ".repeat(4097) + "[]"))
            .isInstanceOf(InvalidQueryException.class);
    }

    @Test
    void rejectsOversizedBlankRawPayload() {
        assertThatThrownBy(() -> parser.parse(" ".repeat(4097)))
            .isInstanceOf(InvalidQueryException.class);
    }

    @Test
    void rejectsMoreThanFiveConditions() {
        String condition = "{\"scope\":\"span\",\"key\":\"error.type\",\"operator\":\"exists\"}";

        assertThatThrownBy(() -> parser.parse("[" + String.join(",", List.of(
            condition, condition, condition, condition, condition, condition)) + "]"))
            .isInstanceOf(InvalidQueryException.class);
    }

    @Test
    void rejectsInvalidScopeAndOperator() {
        assertThatThrownBy(() -> parser.parse("""
            [{"scope":"log","key":"error.type","operator":"exists"}]
            """)).isInstanceOf(InvalidQueryException.class);
        assertThatThrownBy(() -> parser.parse("""
            [{"scope":"span","key":"error.type","operator":"matches"}]
            """)).isInstanceOf(InvalidQueryException.class);
    }

    @Test
    void rejectsBlankAndOversizedKeys() {
        assertThatThrownBy(() -> parser.parse("""
            [{"scope":"span","key":"  ","operator":"exists"}]
            """)).isInstanceOf(InvalidQueryException.class);
        assertThatThrownBy(() -> parser.parse("""
            [{"scope":"span","key":"%s","operator":"exists"}]
            """.formatted("k".repeat(129)))).isInstanceOf(InvalidQueryException.class);
    }

    @Test
    void rejectsMissingNonStringAndOversizedValues() {
        assertThatThrownBy(() -> parser.parse("""
            [{"scope":"span","key":"db.system","operator":"equals"}]
            """)).isInstanceOf(InvalidQueryException.class);
        assertThatThrownBy(() -> parser.parse("""
            [{"scope":"span","key":"db.system","operator":"equals","value":42}]
            """)).isInstanceOf(InvalidQueryException.class);
        assertThatThrownBy(() -> parser.parse("""
            [{"scope":"span","key":"db.query.text","operator":"contains","value":"%s"}]
            """.formatted("v".repeat(513)))).isInstanceOf(InvalidQueryException.class);
    }

    @Test
    void rejectsExistsWithNonEmptyValue() {
        assertThatThrownBy(() -> parser.parse("""
            [{"scope":"span","key":"error.type","operator":"exists","value":"present"}]
            """)).isInstanceOf(InvalidQueryException.class);
    }

    @Test
    void rejectsDuplicateNormalizedConditions() {
        assertThatThrownBy(() -> parser.parse("""
            [
              {"scope":" SPAN ","key":" error.type ","operator":" EXISTS ","value":""},
              {"scope":"span","key":"error.type","operator":"exists"}
            ]
            """)).isInstanceOf(InvalidQueryException.class);
    }

    @Test
    void rejectsNullItems() {
        assertThatThrownBy(() -> parser.parse("[null]"))
            .isInstanceOf(InvalidQueryException.class);
    }
}
