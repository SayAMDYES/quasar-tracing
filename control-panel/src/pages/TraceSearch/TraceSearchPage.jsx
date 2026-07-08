/**
 * Trace Search — filter the trace_summary stream by service, operation, status
 * and duration, then drill into a trace. The global time range scopes results.
 *
 * @author Quasar
 */
import { useEffect, useMemo, useState } from 'react';
import { Table, Select, Input, InputNumber, Space, Typography } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/PageHeader';
import Toolbar from '@/components/Toolbar';
import DurationBar from '@/components/DurationBar';
import CopyableId from '@/components/CopyableId';
import { ServiceBadge, SpanStatusTag, EnvTag } from '@/components/tags';
import { useApp } from '@/context/AppContext';
import useFetch from '@/hooks/useFetch';
import { searchTraces, fetchFilters } from '@/api';
import { formatTime, formatInt, fromNow } from '@/utils/format';
import { status as statusColors } from '@/theme/tokens';

const { Text } = Typography;

function MetadataCell({ value }) {
  return value ? <span className="mono table-cell-strong" title={value}>{value}</span> : <span className="muted">—</span>;
}

export default function TraceSearchPage() {
  const { range, autoRefreshRevision } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const urlFilters = useMemo(
    () => ({
      service: searchParams.get('service') || undefined,
      operation: searchParams.get('operation') || undefined,
      environment: searchParams.get('environment') || undefined,
      namespace: searchParams.get('namespace') || undefined,
      k8sPodName: searchParams.get('k8sPodName') || undefined,
      k8sNodeName: searchParams.get('k8sNodeName') || undefined,
      serviceInstanceId: searchParams.get('serviceInstanceId') || undefined,
      status: searchParams.get('status') || 'all',
      minDurationMs: searchParams.get('minDurationMs') ? Number(searchParams.get('minDurationMs')) : undefined,
      q: searchParams.get('q') || '',
    }),
    [searchParams],
  );

  const [form, setForm] = useState({
    ...urlFilters,
  });
  const [applied, setApplied] = useState(form);

  useEffect(() => {
    setForm((f) => ({ ...f, ...urlFilters }));
    setApplied((f) => ({ ...f, ...urlFilters }));
  }, [urlFilters]);

  const { data: filters } = useFetch(fetchFilters, []);
  const { data, loading, error, refetch } = useFetch(
    () => searchTraces({ ...applied, from: range.from, to: range.to, limit: 200 }),
    [applied, range.from, range.to],
    { backgroundKey: autoRefreshRevision },
  );

  const apply = () => setApplied(form);
  const maxNs = useMemo(
    () => (data?.items?.length ? Math.max(...data.items.map((it) => it.durationNs)) : 1),
    [data],
  );

  const columns = [
    {
      title: t('traceSearch.colTraceId'),
      dataIndex: 'traceId',
      width: 132,
      render: (id) => <CopyableId value={id} short head={10} />,
    },
    {
      title: t('traceSearch.colRootService'),
      dataIndex: 'rootService',
      width: 180,
      render: (s) => <ServiceBadge name={s} />,
    },
    {
      title: t('traceSearch.colOperation'),
      dataIndex: 'rootName',
      width: 420,
      ellipsis: true,
      render: (n) => <span className="mono table-cell-strong">{n}</span>,
    },
    {
      title: t('traceSearch.colDuration'),
      dataIndex: 'durationNs',
      width: 220,
      sorter: (a, b) => a.durationNs - b.durationNs,
      defaultSortOrder: 'descend',
      render: (v) => <DurationBar valueNs={v} maxNs={maxNs} width={136} />,
    },
    {
      title: t('traceSearch.colSpans'),
      dataIndex: 'spanCount',
      width: 76,
      align: 'right',
      sorter: (a, b) => a.spanCount - b.spanCount,
      render: (v) => <span className="num">{v}</span>,
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
      title: t('traceSearch.colStatus'),
      dataIndex: 'status',
      width: 92,
      render: (s) => <SpanStatusTag value={s} />,
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
    {
      title: t('traceSearch.colStarted'),
      dataIndex: 'startTime',
      width: 150,
      sorter: (a, b) => a.startTime - b.startTime,
      render: (ts) => (
        <Space direction="vertical" size={0}>
          <span className="num" style={{ fontSize: 12 }}>{formatTime(ts)}</span>
          <Text type="secondary" style={{ fontSize: 11 }}>{fromNow(ts)}</Text>
        </Space>
      ),
    },
  ];

  const serviceOptions = filters?.services?.map((s) => ({ label: s.name, value: s.name })) || [];
  const opOptions = filters?.operations?.map((o) => ({ label: o, value: o })) || [];
  const environmentOptions = filters?.environments?.map((v) => ({ label: v, value: v })) || [];
  const namespaceOptions = (filters?.namespaces || filters?.k8sNamespaces || []).map((v) => ({ label: v, value: v }));
  const podOptions = filters?.k8sPodNames?.map((v) => ({ label: v, value: v })) || [];
  const nodeOptions = filters?.k8sNodeNames?.map((v) => ({ label: v, value: v })) || [];
  const instanceOptions = filters?.serviceInstances?.map((v) => ({ label: v, value: v })) || [];

  return (
    <>
      <PageHeader title={t('traceSearch.title')} description={t('traceSearch.description')} />

      <Toolbar
        style={{ marginBottom: 16 }}
        className="query-toolbar"
      >
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
              onChange={(v) => {
                setForm((f) => ({ ...f, service: v }));
                setApplied((f) => ({ ...f, service: v }));
              }}
            />
          </div>
          <div className="query-filter-field is-wide">
            <Text className="query-filter-label">{t('traceSearch.operation')}</Text>
            <Select
              allowClear
              showSearch
              placeholder={t('traceSearch.operation')}
              options={opOptions}
              value={form.operation}
              onChange={(v) => {
                setForm((f) => ({ ...f, operation: v }));
                setApplied((f) => ({ ...f, operation: v }));
              }}
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
              onChange={(v) => {
                setForm((f) => ({ ...f, environment: v }));
                setApplied((f) => ({ ...f, environment: v }));
              }}
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
              onChange={(v) => {
                setForm((f) => ({ ...f, status: v }));
                setApplied((f) => ({ ...f, status: v }));
              }}
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
              onChange={(v) => {
                setForm((f) => ({ ...f, namespace: v }));
                setApplied((f) => ({ ...f, namespace: v }));
              }}
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
              onChange={(v) => {
                setForm((f) => ({ ...f, k8sPodName: v }));
                setApplied((f) => ({ ...f, k8sPodName: v }));
              }}
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
              onChange={(v) => {
                setForm((f) => ({ ...f, k8sNodeName: v }));
                setApplied((f) => ({ ...f, k8sNodeName: v }));
              }}
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
              onChange={(v) => {
                setForm((f) => ({ ...f, serviceInstanceId: v }));
                setApplied((f) => ({ ...f, serviceInstanceId: v }));
              }}
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
        </div>
      </Toolbar>

      <div style={{ marginBottom: 10 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {data ? t('traceSearch.countTraces', { n: formatInt(data.total) }) : t('traceSearch.searching')}
          {data && data.total > data.items.length ? ` · ${t('common.showingFirst', { n: data.items.length })}` : ''}
        </Text>
      </div>

      <Table
        rowKey="traceId"
        className="data-table"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={data?.items || []}
        pagination={{ pageSize: 20, showSizeChanger: false, size: 'small' }}
        scroll={{ x: 1694 }}
        onRow={(r) => ({
          onClick: () => navigate(`/traces/${r.traceId}`),
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
