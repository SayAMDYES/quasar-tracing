package org.quasar.tracing.common.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A normalized Resource or Span Attribute condition used by trace queries.
 *
 * @author Quasar
 * @version 1.0.0
 * @since 2026/07/18
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TraceAttributeConditionDTO {

    private String scope;

    private String key;

    private String operator;

    private String value;
}
