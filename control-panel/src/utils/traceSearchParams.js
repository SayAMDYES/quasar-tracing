/**
 * Pure URL and request transformations for trace search filters.
 *
 * @author Quasar
 */

const ATTRIBUTE_RAW_MAX = 4096;
const ATTRIBUTE_CONDITION_MAX = 5;
const ATTRIBUTE_KEY_MAX = 128;
const ATTRIBUTE_VALUE_MAX = 512;

const ATTRIBUTE_FIELDS = new Set(['scope', 'key', 'operator', 'value']);
const ATTRIBUTE_SCOPES = new Set(['resource', 'span']);
const ATTRIBUTE_OPERATORS = new Set(['equals', 'contains', 'exists']);
const FIXED_FILTER_KEYS = [
  'service',
  'operation',
  'spanService',
  'spanOperation',
  'spanStatus',
  'environment',
  'namespace',
  'k8sPodName',
  'k8sNodeName',
  'serviceInstanceId',
  'status',
  'minDurationMs',
  'maxDurationMs',
  'q',
];

function conditionError(index, message) {
  return `Attribute condition ${index + 1} ${message}`;
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function decodeDuration(searchParams, key) {
  const value = searchParams.get(key);
  return value ? Number(value) : undefined;
}

export function normalizeAttributeConditions(conditions = []) {
  if (!Array.isArray(conditions)) {
    return { conditions: [], errors: ['Attribute conditions must be a JSON array'] };
  }
  if (conditions.length > ATTRIBUTE_CONDITION_MAX) {
    return {
      conditions: [],
      errors: [`At most ${ATTRIBUTE_CONDITION_MAX} attribute conditions are allowed`],
    };
  }

  const normalized = [];
  const errors = [];
  const uniqueConditions = new Set();

  conditions.forEach((condition, index) => {
    if (condition == null) {
      errors.push(conditionError(index, 'must not be null'));
      return;
    }
    if (typeof condition !== 'object' || Array.isArray(condition)) {
      errors.push(conditionError(index, 'must be a JSON object'));
      return;
    }

    const unknownField = Object.keys(condition).find((field) => !ATTRIBUTE_FIELDS.has(field));
    if (unknownField) {
      errors.push(conditionError(index, `contains unsupported field: ${unknownField}`));
      return;
    }
    if (typeof condition.scope !== 'string') {
      errors.push(conditionError(index, 'scope must be a JSON string'));
      return;
    }
    if (typeof condition.key !== 'string') {
      errors.push(conditionError(index, 'key must be a JSON string'));
      return;
    }
    if (typeof condition.operator !== 'string') {
      errors.push(conditionError(index, 'operator must be a JSON string'));
      return;
    }

    const scope = condition.scope.trim().toLowerCase();
    const key = condition.key.trim();
    const operator = condition.operator.trim().toLowerCase();
    if (!ATTRIBUTE_SCOPES.has(scope)) {
      errors.push(conditionError(index, 'scope must be resource or span'));
      return;
    }
    if (!ATTRIBUTE_OPERATORS.has(operator)) {
      errors.push(conditionError(index, 'operator must be equals, contains, or exists'));
      return;
    }
    if (!key || key.length > ATTRIBUTE_KEY_MAX) {
      errors.push(conditionError(index, `key length must be between 1 and ${ATTRIBUTE_KEY_MAX}`));
      return;
    }

    let value = condition.value;
    if (operator === 'equals' || operator === 'contains') {
      if (typeof value !== 'string') {
        errors.push(conditionError(index, `value must be a JSON string for ${operator}`));
        return;
      }
      if (value.length > ATTRIBUTE_VALUE_MAX) {
        errors.push(conditionError(index, `value length must not exceed ${ATTRIBUTE_VALUE_MAX}`));
        return;
      }
    } else {
      if (value !== undefined && value !== null && value !== '') {
        errors.push(conditionError(index, 'value must be empty for exists'));
        return;
      }
      value = null;
    }

    const duplicateKey = JSON.stringify([scope, key, operator, value]);
    if (uniqueConditions.has(duplicateKey)) {
      errors.push(conditionError(index, 'duplicates another condition'));
      return;
    }
    uniqueConditions.add(duplicateKey);
    normalized.push({ scope, key, operator, value });
  });

  return { conditions: normalized, errors };
}

export function decodeTraceSearchParams(searchParams) {
  const params = searchParams instanceof URLSearchParams
    ? searchParams
    : new URLSearchParams(searchParams);
  const rawAttributes = params.get('attributes');
  let attributeConditions = [];
  let attributeError = null;

  if (rawAttributes !== null) {
    if (rawAttributes.length > ATTRIBUTE_RAW_MAX) {
      attributeError = `Attribute conditions exceed the maximum length of ${ATTRIBUTE_RAW_MAX}`;
    } else if (rawAttributes.trim()) {
      try {
        const result = normalizeAttributeConditions(JSON.parse(rawAttributes));
        attributeConditions = result.conditions;
        attributeError = result.errors.length ? result.errors.join('; ') : null;
      } catch {
        attributeError = 'Attribute conditions must be valid JSON';
      }
    }
  }

  return {
    filters: {
      service: params.get('service') || undefined,
      operation: params.get('operation') || undefined,
      spanService: params.get('spanService') || undefined,
      spanOperation: params.get('spanOperation') || undefined,
      spanStatus: params.get('spanStatus') || undefined,
      environment: params.get('environment') || undefined,
      namespace: params.get('namespace') || undefined,
      k8sPodName: params.get('k8sPodName') || undefined,
      k8sNodeName: params.get('k8sNodeName') || undefined,
      serviceInstanceId: params.get('serviceInstanceId') || undefined,
      status: params.get('status') || 'all',
      minDurationMs: decodeDuration(params, 'minDurationMs'),
      maxDurationMs: decodeDuration(params, 'maxDurationMs'),
      q: params.get('q') || '',
      attributeConditions,
    },
    attributeError,
  };
}

export function toTraceSearchRequest(filters = {}) {
  const request = {};

  FIXED_FILTER_KEYS.forEach((key) => {
    let value = filters[key];
    if (key === 'q' && typeof value === 'string') value = value.trim();
    if (key === 'status' && value === 'all') return;
    if (hasValue(value)) request[key] = value;
  });

  const normalized = normalizeAttributeConditions(filters.attributeConditions);
  if (normalized.errors.length) {
    throw new Error(`Invalid attribute conditions: ${normalized.errors.join('; ')}`);
  }
  if (normalized.conditions.length) {
    request.attributes = JSON.stringify(normalized.conditions);
  }

  return request;
}

export function encodeTraceSearchParams(filters = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(toTraceSearchRequest(filters)).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });
  return searchParams;
}
