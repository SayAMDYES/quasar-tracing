/**
 * Trace Search — filter the trace_summary stream by service, operation, status
 * and duration, then drill into a trace. The global time range scopes results.
 *
 * @author Quasar
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Collapse, Input, InputNumber, Row, Select, Space, Table, Tag, Typography } from 'antd';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DiffOutlined } from '@ant-design/icons';
import PageHeader from '@/components/PageHeader';
import Toolbar from '@/components/Toolbar';
import EChart from '@/components/EChart';
import DurationBar from '@/components/DurationBar';
import CopyableId from '@/components/CopyableId';
import TraceSourceSelector from '@/components/TraceSourceSelector';
import TraceAttributeFilterBuilder from '@/components/TraceAttributeFilterBuilder';
import { ServiceBadge, SpanStatusTag, EnvTag } from '@/components/tags';
import { useApp } from '@/context/AppContext';
import { useThemeMode } from '@/context/ThemeContext';
import useFetch from '@/hooks/useFetch';
import useInvestigationRange from '@/hooks/useInvestigationRange';
import { searchTraces, fetchArchiveCapabilities, fetchFilters } from '@/api';
import { buildTraceDistributionCharts } from '@/charts/options';
import { formatTime, formatInt, fromNow } from '@/utils/format';
import {
  decodeTraceSearchParams,
  encodeTraceSearchParams,
  normalizeAttributeConditions,
  toTraceSearchRequest,
} from '@/utils/traceSearchParams';
import { parseInvestigationRange } from '@/utils/investigationContext';
import { status as statusColors } from '@/theme/tokens';
import { useTraceCompareSelection } from '@/context/TraceCompareSelectionContext';
import {
  liveTraceRef,
  parseTraceSourceRef,
  traceComparePath,
} from '@/utils/traceSourceRef';

const { Text } = Typography;

const TRACE_SORT_FIELDS = {
  durationNs: 'duration',
  spanCount: 'spans',
  startTime: 'startTime',
};

const DEFAULT_FILTERS = {
  service: undefined,
  operation: undefined,
  environment: undefined,
  namespace: undefined,
  k8sPodName: undefined,
  k8sNodeName: undefined,
  serviceInstanceId: undefined,
  status: 'all',
  minDurationMs: undefined,
  maxDurationMs: undefined,
  q: '',
  attributeConditions: [],
};

function roundDurationFilter(value) {
  if (value == null) return undefined;
  if (value < 10) return Number(value.toFixed(2));
  if (value < 100) return Number(value.toFixed(1));
  return Math.ceil(value);
}

function MetadataCell({ value }) {
  return value ? <span className="mono table-cell-strong" title={value}>{value}</span> : <span className="muted">—</span>;
}

function isNestedInteractiveTarget(event) {
  return event.target !== event.currentTarget;
}

function isRowActionTarget(event) {
  return event.target instanceof Element
    && Boolean(event.target.closest('a, button, input, .ant-checkbox-wrapper, .ant-typography-copy'));
}

function attributeConditionKey(condition) {
  return JSON.stringify([
    condition.scope,
    condition.key,
    condition.operator,
    condition.value,
  ]);
}

function appliedConditionLabel(condition, t) {
  return t('traceSearch.appliedCondition', {
    scope: t(`traceSearch.${condition.scope}`),
    key: condition.key,
    operator: t(`traceSearch.${condition.operator}`),
    value: condition.operator === 'exists' ? '' : ` · ${condition.value}`,
  });
}

function encodeFiltersWithRange(filters, investigationRange, source) {
  const params = encodeTraceSearchParams(filters);
  if (investigationRange) {
    params.set('from', String(investigationRange.from));
    params.set('to', String(investigationRange.to));
  }
  if (source === 'archive') params.set('source', 'archive');
  return params;
}

export default function TraceSearchPage() {
  const { chartTheme } = useThemeMode();
  const { autoRefreshRevision } = useApp();
  const compareSelection = useTraceCompareSelection();
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const effectiveRange = useInvestigationRange(searchParams);
  const investigationRange = useMemo(
    () => parseInvestigationRange(new URLSearchParams(searchParamsString)),
    [searchParamsString],
  );
  const rangeToPersist = investigationRange ? effectiveRange : null;
  const { filters: applied, attributeError } = useMemo(
    () => decodeTraceSearchParams(new URLSearchParams(searchParamsString)),
    [searchParamsString],
  );
  const [form, setForm] = useState(() => ({ ...DEFAULT_FILTERS, ...applied }));
  const [tableSort, setTableSort] = useState({ field: 'startTime', order: 'descend' });
  const [compareMode, setCompareMode] = useState(() => location.state?.compareMode === true);
  const searchSource = searchParams.get('source') === 'archive' ? 'archive' : 'live';
  const selectedServerTraceIds = compareSelection.selectedRefs
    .map(parseTraceSourceRef)
    .filter((ref) => ref?.source === searchSource)
    .map((ref) => ref.traceId);
  const comparePath = compareSelection.selectedRefs.length === 2
    ? traceComparePath(compareSelection.selectedRefs[0], compareSelection.selectedRefs[1])
    : null;
  const traceRequest = useMemo(() => ({
    ...toTraceSearchRequest(applied),
    from: effectiveRange.from,
    to: effectiveRange.to,
    sort: TRACE_SORT_FIELDS[tableSort.field],
    order: tableSort.order === 'ascend' ? 'asc' : 'desc',
    source: searchSource,
  }), [applied, effectiveRange.from, effectiveRange.to, searchSource, tableSort.field, tableSort.order]);

  useEffect(() => {
    const decoded = decodeTraceSearchParams(new URLSearchParams(searchParamsString));
    setForm({ ...DEFAULT_FILTERS, ...decoded.filters });
  }, [searchParamsString]);

  const { data: filters } = useFetch(fetchFilters, []);
  const { data: archiveCapabilities } = useFetch(fetchArchiveCapabilities, []);
  const { data, loading, error, refetch } = useFetch(
    () => attributeError
      ? Promise.resolve({ items: [], total: 0 })
      : searchTraces({
        ...traceRequest,
        limit: 200,
      }),
    [attributeError, traceRequest],
    { backgroundKey: autoRefreshRevision },
  );

  const apply = () => {
    const normalized = normalizeAttributeConditions(form.attributeConditions);
    if (normalized.errors.length) return;
    const next = { ...form, attributeConditions: normalized.conditions };
    setForm(next);
    setSearchParams(encodeFiltersWithRange(next, rangeToPersist, searchSource));
  };
  const resetFilters = () => {
    setForm({ ...DEFAULT_FILTERS, attributeConditions: [] });
    setSearchParams(encodeFiltersWithRange(DEFAULT_FILTERS, rangeToPersist, searchSource));
  };
  const changeSource = (value) => {
    const next = new URLSearchParams(searchParamsString);
    if (value === 'archive') next.set('source', 'archive');
    else next.delete('source');
    setSearchParams(next);
  };
  const clearInvalidAttributes = () => {
    const next = new URLSearchParams(searchParamsString);
    next.delete('attributes');
    setSearchParams(next);
  };
  const removeAppliedAttributeCondition = (index) => {
    const next = {
      ...applied,
      attributeConditions: applied.attributeConditions.filter(
        (_, conditionIndex) => conditionIndex !== index,
      ),
    };
    setSearchParams(encodeFiltersWithRange(next, rangeToPersist, searchSource));
  };
  const applyDurationRange = (bucket) => {
    if (!bucket) return;
    const next = {
      ...form,
      minDurationMs: roundDurationFilter(bucket.start),
      maxDurationMs: roundDurationFilter(bucket.end),
    };
    const normalized = normalizeAttributeConditions(next.attributeConditions);
    if (normalized.errors.length) return;
    const normalizedNext = { ...next, attributeConditions: normalized.conditions };
    setForm(normalizedNext);
    setSearchParams(encodeFiltersWithRange(normalizedNext, rangeToPersist, searchSource));
  };
  const maxNs = useMemo(
    () => (data?.items?.length ? Math.max(...data.items.map((it) => it.durationNs)) : 1),
    [data],
  );
  const distributionCharts = useMemo(() => {
    if (!data?.items?.length) return null;
    return buildTraceDistributionCharts(data.items, effectiveRange, chartTheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, effectiveRange.from, effectiveRange.to, i18n.language, chartTheme]);

  const columns = [
    {
      title: t('traceSearch.colTraceIdentity'),
      key: 'traceIdentity',
      width: 560,
      ellipsis: true,
      render: (_, trace) => (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Space size={8} wrap>
            <ServiceBadge name={trace.rootService} />
            <span className="mono table-cell-strong" title={trace.rootName}>
              {trace.rootName}
            </span>
            {trace.source === 'archive'
              ? <Tag color="purple">{t('traceArchive.sourceArchive')}</Tag>
              : <Tag>{t('traceArchive.sourceLive')}</Tag>}
          </Space>
          <Space size={6} wrap>
            <Text type="secondary" style={{ fontSize: 11 }}>{t('traceSearch.colTraceId')}</Text>
            <CopyableId value={trace.traceId} short head={14} />
          </Space>
        </Space>
      ),
    },
    {
      title: t('traceSearch.colStatus'),
      dataIndex: 'status',
      width: 92,
      render: (s) => <SpanStatusTag value={s} />,
    },
    {
      title: t('traceSearch.colErrors'),
      dataIndex: 'errorCount',
      width: 76,
      align: 'right',
      render: (v) => (
        <span className="num" style={{ color: v > 0 ? statusColors.error : 'var(--text-muted)' }}>
          {v}
        </span>
      ),
    },
    {
      title: t('traceSearch.colDuration'),
      dataIndex: 'durationNs',
      width: 220,
      sorter: true,
      sortDirections: ['descend', 'ascend', 'descend'],
      sortOrder: tableSort.field === 'durationNs' ? tableSort.order : null,
      render: (v) => <DurationBar valueNs={v} maxNs={maxNs} width={136} />,
    },
    {
      title: t('traceSearch.colSpans'),
      dataIndex: 'spanCount',
      width: 76,
      align: 'right',
      sorter: true,
      sortDirections: ['descend', 'ascend', 'descend'],
      sortOrder: tableSort.field === 'spanCount' ? tableSort.order : null,
      render: (v) => <span className="num">{v}</span>,
    },
    {
      title: t('traceSearch.colStarted'),
      dataIndex: 'startTime',
      width: 150,
      sorter: true,
      sortDirections: ['descend', 'ascend', 'descend'],
      sortOrder: tableSort.field === 'startTime' ? tableSort.order : null,
      render: (ts) => (
        <Space direction="vertical" size={0}>
          <span className="num" style={{ fontSize: 12 }}>{formatTime(ts)}</span>
          <Text type="secondary" style={{ fontSize: 11 }}>{fromNow(ts)}</Text>
        </Space>
      ),
    },
    {
      title: t('traceSearch.colEnv'),
      dataIndex: 'environment',
      width: 110,
      render: (e) => <EnvTag value={e} />,
    },
    {
      title: t('traceSearch.namespace'),
      dataIndex: 'k8sNamespace',
      width: 128,
      ellipsis: true,
      render: (v) => <MetadataCell value={v} />,
    },
    {
      title: t('traceSearch.pod'),
      dataIndex: 'k8sPodName',
      width: 220,
      ellipsis: true,
      render: (v) => <MetadataCell value={v} />,
    },
    {
      title: t('traceSearch.instance'),
      dataIndex: 'serviceInstanceId',
      width: 220,
      ellipsis: true,
      render: (v) => <MetadataCell value={v} />,
    },
  ];

  const serviceOptions = filters?.services?.map((s) => ({ label: s.name, value: s.name })) || [];
  const opOptions = filters?.operations?.map((o) => ({ label: o, value: o })) || [];
  const environmentOptions = filters?.environments?.map((v) => ({ label: v, value: v })) || [];
  const namespaceOptions = (filters?.namespaces || filters?.k8sNamespaces || []).map((v) => ({ label: v, value: v }));
  const podOptions = filters?.k8sPodNames?.map((v) => ({ label: v, value: v })) || [];
  const nodeOptions = filters?.k8sNodeNames?.map((v) => ({ label: v, value: v })) || [];
  const instanceOptions = filters?.serviceInstances?.map((v) => ({ label: v, value: v })) || [];
  const activeFilterCount = [
    applied.q,
    applied.service,
    applied.operation,
    applied.spanService,
    applied.spanOperation,
    applied.spanStatus,
    applied.environment,
    applied.status && applied.status !== 'all' ? applied.status : undefined,
    applied.namespace,
    applied.k8sPodName,
    applied.k8sNodeName,
    applied.serviceInstanceId,
    applied.minDurationMs,
    applied.maxDurationMs,
  ].filter((v) => v !== undefined && v !== null && v !== '').length
    + applied.attributeConditions.length;
  const normalizedDraft = normalizeAttributeConditions(form.attributeConditions);
  const hasDraftChanges = normalizedDraft.errors.length > 0
    || JSON.stringify(toTraceSearchRequest({
      ...form,
      attributeConditions: normalizedDraft.conditions,
    })) !== JSON.stringify(toTraceSearchRequest(applied));
  const enterCompareMode = () => {
    compareSelection.clear();
    setCompareMode(true);
  };
  const cancelCompare = () => {
    compareSelection.clear();
    setCompareMode(false);
  };

  return (
    <>
      <PageHeader
        title={t('traceSearch.title')}
        description={t('traceSearch.description')}
        extra={(
          <Space wrap>
            <TraceSourceSelector
              enabled={archiveCapabilities?.enabled}
              value={searchSource}
              onChange={changeSource}
            />
            {compareMode && (
              <Button onClick={cancelCompare}>{t('common.cancel')}</Button>
            )}
            <Button
              type={compareMode ? 'primary' : 'default'}
              icon={<DiffOutlined />}
              disabled={compareMode && !comparePath}
              onClick={() => {
                if (!compareMode) {
                  enterCompareMode();
                } else if (comparePath) {
                  navigate(comparePath);
                }
              }}
            >
              {compareMode
                ? t('traceCompare.compareSelected', { count: compareSelection.selectedRefs.length })
                : t('traceCompare.compare')}
            </Button>
          </Space>
        )}
      />

      <Toolbar
        style={{ marginBottom: 16 }}
        className="query-toolbar"
      >
        <div className="query-filter-panel">
          <div className="query-filter-group">
            <div className="query-filter-field is-wide">
              <Text className="query-filter-label">{t('traceSearch.searchPlaceholder')}</Text>
              <Input.Search
                allowClear
                placeholder={t('traceSearch.searchPlaceholder')}
                value={form.q}
                onChange={(e) => setForm((f) => ({ ...f, q: e.target.value }))}
                onSearch={apply}
              />
            </div>
            <div className="query-filter-field">
              <Text className="query-filter-label">{t('traceSearch.service')}</Text>
              <Select
                allowClear
                showSearch
                placeholder={t('traceSearch.service')}
                options={serviceOptions}
                value={form.service}
                onChange={(v) => setForm((f) => ({ ...f, service: v }))}
              />
            </div>
            <div className="query-filter-field">
              <Text className="query-filter-label">{t('traceSearch.environment')}</Text>
              <Select
                allowClear
                showSearch
                placeholder={t('traceSearch.environment')}
                options={environmentOptions}
                value={form.environment}
                onChange={(v) => setForm((f) => ({ ...f, environment: v }))}
              />
            </div>
            <div className="query-filter-field">
              <Text className="query-filter-label">{t('traceSearch.colStatus')}</Text>
              <Select
                value={form.status}
                options={[
                  { label: t('traceSearch.statusAll'), value: 'all' },
                  { label: t('traceSearch.statusOk'), value: 'ok' },
                  { label: t('traceSearch.statusErrors'), value: 'error' },
                ]}
                onChange={(v) => setForm((f) => ({ ...f, status: v }))}
              />
            </div>
            <div className="query-filter-actions">
              {activeFilterCount > 0 && <Tag className="query-filter-chip">{t('common.activeFilters', { count: activeFilterCount })}</Tag>}
              {hasDraftChanges && <Tag>{t('common.unappliedChanges')}</Tag>}
              <Button
                type="primary"
                disabled={normalizedDraft.errors.length > 0}
                onClick={apply}
              >
                {t('common.apply')}
              </Button>
              <Button onClick={resetFilters}>{t('common.reset')}</Button>
            </div>
          </div>
          <Collapse
            ghost
            size="small"
            className="query-advanced"
            items={[
              {
                key: 'advanced',
                label: t('common.advancedFilters'),
                children: (
                  <div className="query-filter-group query-filter-group-advanced">
                    <div className="query-filter-field is-wide">
                      <Text className="query-filter-label">{t('traceSearch.operation')}</Text>
                      <Select
                        allowClear
                        showSearch
                        placeholder={t('traceSearch.operation')}
                        options={opOptions}
                        value={form.operation}
                        onChange={(v) => setForm((f) => ({ ...f, operation: v }))}
                      />
                    </div>
                    <div className="query-filter-field">
                      <Text className="query-filter-label">{t('traceSearch.namespace')}</Text>
                      <Select
                        allowClear
                        showSearch
                        placeholder={t('traceSearch.namespace')}
                        options={namespaceOptions}
                        value={form.namespace}
                        onChange={(v) => setForm((f) => ({ ...f, namespace: v }))}
                      />
                    </div>
                    <div className="query-filter-field is-wide">
                      <Text className="query-filter-label">{t('traceSearch.pod')}</Text>
                      <Select
                        allowClear
                        showSearch
                        placeholder={t('traceSearch.pod')}
                        options={podOptions}
                        value={form.k8sPodName}
                        onChange={(v) => setForm((f) => ({ ...f, k8sPodName: v }))}
                      />
                    </div>
                    <div className="query-filter-field">
                      <Text className="query-filter-label">{t('traceSearch.node')}</Text>
                      <Select
                        allowClear
                        showSearch
                        placeholder={t('traceSearch.node')}
                        options={nodeOptions}
                        value={form.k8sNodeName}
                        onChange={(v) => setForm((f) => ({ ...f, k8sNodeName: v }))}
                      />
                    </div>
                    <div className="query-filter-field is-wide">
                      <Text className="query-filter-label">{t('traceSearch.instance')}</Text>
                      <Select
                        allowClear
                        showSearch
                        placeholder={t('traceSearch.instance')}
                        options={instanceOptions}
                        value={form.serviceInstanceId}
                        onChange={(v) => setForm((f) => ({ ...f, serviceInstanceId: v }))}
                      />
                    </div>
                    <div className="query-filter-field is-compact">
                      <Text className="query-filter-label">{t('traceSearch.min')}</Text>
                      <Space.Compact style={{ width: '100%' }}>
                        <InputNumber
                          placeholder="ms"
                          min={0}
                          value={form.minDurationMs}
                          onChange={(v) => setForm((f) => ({ ...f, minDurationMs: v }))}
                          onPressEnter={apply}
                          style={{ width: 'calc(100% - 38px)' }}
                        />
                        <Input value="ms" readOnly style={{ width: 38, color: 'var(--text-muted)' }} />
                      </Space.Compact>
                    </div>
                    <div className="query-filter-field is-compact">
                      <Text className="query-filter-label">{t('traceSearch.max')}</Text>
                      <Space.Compact style={{ width: '100%' }}>
                        <InputNumber
                          placeholder="ms"
                          min={0}
                          value={form.maxDurationMs}
                          onChange={(v) => setForm((f) => ({ ...f, maxDurationMs: v }))}
                          onPressEnter={apply}
                          style={{ width: 'calc(100% - 38px)' }}
                        />
                        <Input value="ms" readOnly style={{ width: 38, color: 'var(--text-muted)' }} />
                      </Space.Compact>
                    </div>
                    <TraceAttributeFilterBuilder
                      conditions={form.attributeConditions}
                      errors={normalizedDraft.errors}
                      onChange={(attributeConditions) => setForm((current) => ({
                        ...current,
                        attributeConditions,
                      }))}
                    />
                  </div>
                ),
              },
            ]}
          />
        </div>
      </Toolbar>

      {applied.attributeConditions.length > 0 && (
        <div className="trace-attribute-chips" aria-label={t('traceSearch.attributeTitle')}>
          <Text className="trace-attribute-chips-label">{t('traceSearch.attributeTitle')}</Text>
          {applied.attributeConditions.map((condition, index) => (
            <Tag
              className="trace-attribute-chip"
              key={attributeConditionKey(condition)}
              closable
              onClose={() => removeAppliedAttributeCondition(index)}
            >
              {appliedConditionLabel(condition, t)}
            </Tag>
          ))}
        </div>
      )}

      {attributeError && (
        <Alert
          showIcon
          closable
          type="error"
          message={t('traceSearch.invalidUrl')}
          description={t('traceSearch.invalidUrlHint')}
          action={(
            <Button size="small" onClick={clearInvalidAttributes}>
              {t('traceSearch.clearInvalid')}
            </Button>
          )}
          onClose={clearInvalidAttributes}
          style={{ marginBottom: 16 }}
        />
      )}

      <div style={{ marginBottom: 10 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {data ? t('traceSearch.countTraces', { n: formatInt(data.total) }) : t('traceSearch.searching')}
          {data && data.total > data.items.length ? ` · ${t('common.showingFirst', { n: data.items.length })}` : ''}
        </Text>
      </div>

      {distributionCharts && (
        <Card
          size="small"
          title={t('traceSearch.distributionTitle')}
          style={{ marginBottom: 16 }}
          extra={<Text type="secondary" style={{ fontSize: 12 }}>{t('traceSearch.distributionHint')}</Text>}
        >
          <Row gutter={[16, 12]}>
            <Col xs={24} xl={16}>
              <EChart
                option={distributionCharts.scatter}
                height={220}
                onEvents={{
                  click: (params) => {
                    if (params.data?.traceId) navigate(`/traces/${params.data.traceId}${searchSource === 'archive' ? '?source=archive' : ''}`);
                  },
                }}
              />
            </Col>
            <Col xs={24} xl={8}>
              <EChart
                option={distributionCharts.histogram}
                height={220}
                onEvents={{
                  click: (params) => applyDurationRange(params.data),
                }}
              />
            </Col>
          </Row>
        </Card>
      )}

      <Table
        rowKey="traceId"
        className="data-table"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={data?.items || []}
        rowSelection={compareMode ? {
          preserveSelectedRowKeys: true,
          selectedRowKeys: selectedServerTraceIds,
          onChange: (keys) => {
            compareSelection.setSelectedRefs([
              ...keys.map((traceId) => (searchSource === 'archive'
                ? `archive:${traceId}` : liveTraceRef(traceId))).filter(Boolean),
            ]);
          },
          getCheckboxProps: (record) => ({
            disabled: compareSelection.selectedRefs.length >= 2
              && !compareSelection.selectedRefs.includes(searchSource === 'archive'
                ? `archive:${record.traceId}` : liveTraceRef(record.traceId)),
          }),
        } : undefined}
        pagination={{ pageSize: 20, showSizeChanger: false, size: 'small' }}
        scroll={{ x: 1852 }}
        onChange={(_, __, sorter) => {
          const next = Array.isArray(sorter) ? sorter[0] : sorter;
          if (TRACE_SORT_FIELDS[next?.field] && next.order) {
            setTableSort({ field: next.field, order: next.order });
          }
        }}
        onRow={(r) => ({
          onClick: (event) => {
            if (!isRowActionTarget(event)) navigate(`/traces/${r.traceId}${searchSource === 'archive' ? '?source=archive' : ''}`);
          },
          onKeyDown: (e) => {
            if (isNestedInteractiveTarget(e)) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate(`/traces/${r.traceId}`);
            }
          },
          role: 'button',
          tabIndex: 0,
          'aria-label': `${r.rootService || ''} ${r.rootName || ''} ${r.traceId}`.trim(),
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: error ? (
            <Space direction="vertical" style={{ padding: 24 }}>
              <Text type="danger">{error.message}</Text>
              <a onClick={refetch}>{t('common.retry')}</a>
            </Space>
          ) : undefined,
        }}
      />
    </>
  );
}
