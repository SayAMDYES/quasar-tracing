/**
 * Controlled editor for structured Resource and Span attribute conditions.
 *
 * @author Quasar
 */
import { useState } from 'react';
import { Alert, AutoComplete, Button, Input, Select, Typography } from 'antd';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

const MAX_CONDITIONS = 5;
const EMPTY_ERRORS = [];
const DEFAULT_CONDITION = {
  scope: 'span',
  key: '',
  operator: 'equals',
  value: '',
};

export const COMMON_KEYS = {
  resource: [
    'service.namespace',
    'service.instance.id',
    'service.version',
    'deployment.environment.name',
    'k8s.namespace.name',
    'k8s.pod.name',
    'k8s.node.name',
    'container.id',
    'telemetry.sdk.language',
  ],
  span: [
    'http.route',
    'http.request.method',
    'http.response.status_code',
    'db.system',
    'db.operation.name',
    'db.query.text',
    'rpc.system',
    'rpc.service',
    'rpc.method',
    'messaging.system',
    'messaging.destination.name',
    'error.type',
    'exception.type',
    'exception.message',
  ],
};

let nextRowId = 0;

function createRowId() {
  nextRowId += 1;
  return `trace-attribute-row-${nextRowId}`;
}

function filterKeyOption(inputValue, option) {
  return option?.value?.toLowerCase().includes(inputValue.toLowerCase());
}

function validationMessages(errors, t) {
  const messages = new Set();
  errors.forEach((error) => {
    if (/duplicate/i.test(error)) {
      messages.add(t('traceSearch.duplicate'));
    } else if (/at most 5/i.test(error)) {
      messages.add(t('traceSearch.maxFive'));
    } else {
      messages.add(t('traceSearch.required'));
    }
  });
  return [...messages];
}

function rowValidationMessage(errors, index, t) {
  const prefix = `Attribute condition ${index + 1} `;
  const rowErrors = errors.filter((error) => error.startsWith(prefix));
  if (!rowErrors.length) return null;
  return rowErrors.some((error) => /duplicate/i.test(error))
    ? t('traceSearch.duplicate')
    : t('traceSearch.required');
}

export default function TraceAttributeFilterBuilder({
  conditions,
  onChange,
  errors = EMPTY_ERRORS,
  disabled = false,
}) {
  const { t } = useTranslation();
  const [rowIds, setRowIds] = useState(() => (
    Array.from({ length: MAX_CONDITIONS }, createRowId)
  ));
  const messages = validationMessages(errors, t);
  const atMaximum = conditions.length >= MAX_CONDITIONS;

  const updateCondition = (index, patch) => {
    const nextConditions = conditions.map((condition, conditionIndex) => (
      conditionIndex === index ? { ...condition, ...patch } : condition
    ));
    onChange(nextConditions);
  };

  const updateOperator = (index, operator) => {
    updateCondition(index, {
      operator,
      value: operator === 'exists' ? null : (conditions[index].value ?? ''),
    });
  };

  const removeCondition = (index) => {
    const replacementId = createRowId();
    setRowIds((currentIds) => [
      ...currentIds.filter((_, rowIndex) => rowIndex !== index),
      replacementId,
    ]);
    onChange(conditions.filter((_, conditionIndex) => conditionIndex !== index));
  };

  const addCondition = () => {
    if (disabled || atMaximum) return;
    onChange([...conditions, { ...DEFAULT_CONDITION }]);
  };

  return (
    <section className="trace-attribute-builder" aria-labelledby="trace-attribute-builder-title">
      <div className="trace-attribute-builder-header">
        <div>
          <Text id="trace-attribute-builder-title" className="trace-attribute-builder-title">
            {t('traceSearch.attributeTitle')}
          </Text>
          <Text className="trace-attribute-builder-hint">
            {t('traceSearch.sameSpanHint')}
          </Text>
        </div>
        <Button type="dashed" onClick={addCondition} disabled={disabled || atMaximum}>
          {t('traceSearch.add')}
        </Button>
      </div>

      {conditions.length > 0 && (
        <div className="trace-attribute-rows">
          {conditions.map((condition, index) => {
            const keyOptions = (COMMON_KEYS[condition.scope] || COMMON_KEYS.span)
              .map((value) => ({ value }));
            const rowError = rowValidationMessage(errors, index, t);

            return (
              <div className="trace-attribute-row" key={rowIds[index]}>
                <div className="trace-attribute-field is-scope">
                  <Text className="query-filter-label">{t('traceSearch.attributeScope')}</Text>
                  <Select
                    aria-label={t('traceSearch.attributeScope')}
                    disabled={disabled}
                    value={condition.scope}
                    options={[
                      { label: t('traceSearch.resource'), value: 'resource' },
                      { label: t('traceSearch.span'), value: 'span' },
                    ]}
                    onChange={(scope) => updateCondition(index, { scope })}
                  />
                </div>
                <div className="trace-attribute-field is-key">
                  <Text className="query-filter-label">{t('traceSearch.key')}</Text>
                  <AutoComplete
                    aria-label={t('traceSearch.key')}
                    disabled={disabled}
                    value={condition.key}
                    options={keyOptions}
                    filterOption={filterKeyOption}
                    onChange={(key) => updateCondition(index, {
                      key: typeof key === 'string' ? key.slice(0, 128) : '',
                    })}
                  >
                    <Input placeholder={t('traceSearch.key')} />
                  </AutoComplete>
                </div>
                <div className="trace-attribute-field is-operator">
                  <Text className="query-filter-label">{t('traceSearch.attributeOperator')}</Text>
                  <Select
                    aria-label={t('traceSearch.attributeOperator')}
                    disabled={disabled}
                    value={condition.operator}
                    options={[
                      { label: t('traceSearch.equals'), value: 'equals' },
                      { label: t('traceSearch.contains'), value: 'contains' },
                      { label: t('traceSearch.exists'), value: 'exists' },
                    ]}
                    onChange={(operator) => updateOperator(index, operator)}
                  />
                </div>
                {condition.operator === 'exists' ? (
                  <div className="trace-attribute-field is-value" aria-hidden="true" />
                ) : (
                  <div className="trace-attribute-field is-value">
                    <Text className="query-filter-label">{t('traceSearch.value')}</Text>
                    <Input
                      aria-label={t('traceSearch.value')}
                      disabled={disabled}
                      maxLength={512}
                      placeholder={t('traceSearch.value')}
                      value={condition.value ?? ''}
                      onChange={(event) => updateCondition(index, { value: event.target.value })}
                    />
                  </div>
                )}
                <div className="trace-attribute-actions">
                  <Button danger type="text" disabled={disabled} onClick={() => removeCondition(index)}>
                    {t('traceSearch.remove')}
                  </Button>
                </div>
                {rowError && (
                  <Text className="trace-attribute-row-error" type="danger" role="alert">
                    {rowError}
                  </Text>
                )}
              </div>
            );
          })}
        </div>
      )}

      {atMaximum && <Text className="trace-attribute-limit">{t('traceSearch.maxFive')}</Text>}
      {messages.length > 0 && (
        <Alert
          className="trace-attribute-validation"
          type="error"
          showIcon
          message={t('traceSearch.invalidCondition')}
          description={messages.map((message) => <div key={message}>{message}</div>)}
        />
      )}
    </section>
  );
}
