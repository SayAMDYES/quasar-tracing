/**
 * Log Search — full-text + faceted search over log records, with a severity
 * histogram and a detail drawer that links back to the owning trace. Can be
 * pre-filtered by trace_id (from the trace detail "Open in Log Search" action).
 *
 * @author Quasar
 */
import { useEffect, useMemo, useState } from 'react';
import { Table, Select, Input, Card, Typography, Tag } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/PageHeader';
import Toolbar from '@/components/Toolbar';
import EChart from '@/components/EChart';
import AsyncBoundary from '@/components/AsyncBoundary';
import CopyableId from '@/components/CopyableId';
import LogDetailDrawer from './LogDetailDrawer';
import { SeverityTag, ServiceBadge } from '@/components/tags';
import { useApp } from '@/context/AppContext';
import useFetch from '@/hooks/useFetch';
import { searchLogs, fetchFilters } from '@/api';
import { buildSeverityHistogram } from '@/charts/options';
import { formatTime, formatInt } from '@/utils/format';

const { Text } = Typography;

function MetadataCell({ value }) {
  return value ? <span className="mono table-cell-strong" title={value}>{value}</span> : <span className="muted">—</span>;
}

export default function LogSearchPage() {
  const { range, autoRefreshRevision } = useApp();
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFilters = useMemo(
    () => ({
      traceId: searchParams.get('traceId') || undefined,
      spanId: searchParams.get('spanId') || undefined,
      service: searchParams.get('service') || undefined,
      environment: searchParams.get('environment') || undefined,
      namespace: searchParams.get('namespace') || undefined,
      k8sPodName: searchParams.get('k8sPodName') || undefined,
      k8sNodeName: searchParams.get('k8sNodeName') || undefined,
      serviceInstanceId: searchParams.get('serviceInstanceId') || undefined,
      q: searchParams.get('q') || '',
    }),
    [searchParams],
  );
  const traceId = urlFilters.traceId;
  const spanId = urlFilters.spanId;

  const [form, setForm] = useState({
    service: urlFilters.service,
    severities: [],
    environment: urlFilters.environment,
    namespace: urlFilters.namespace,
    k8sPodName: urlFilters.k8sPodName,
    k8sNodeName: urlFilters.k8sNodeName,
    serviceInstanceId: urlFilters.serviceInstanceId,
    q: urlFilters.q,
  });
  const [applied, setApplied] = useState(form);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const next = {
      service: urlFilters.service,
      environment: urlFilters.environment,
      namespace: urlFilters.namespace,
      k8sPodName: urlFilters.k8sPodName,
      k8sNodeName: urlFilters.k8sNodeName,
      serviceInstanceId: urlFilters.serviceInstanceId,
      q: urlFilters.q,
    };
    setForm((f) => ({ ...f, ...next }));
    setApplied((f) => ({ ...f, ...next }));
  }, [urlFilters]);

  const { data: filters } = useFetch(fetchFilters, []);
  const { data, loading, error, refetch } = useFetch(
    () =>
      searchLogs({
        ...applied,
        traceId,
        spanId,
        from: range.from,
        to: range.to,
        limit: 300,
      }),
    [applied, traceId, spanId, range.from, range.to],
    { backgroundKey: autoRefreshRevision },
  );

  const apply = () => setApplied(form);

  const histogramOption = useMemo(() => {
    if (!data?.histogram) return null;
    const step = (range.to - range.from) / Math.max(1, data.histogram.length);
    return buildSeverityHistogram(data.histogram, step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, range, i18n.language]);

  const columns = [
    {
      title: t('logs.colTime'),
      dataIndex: 'timestamp',
      width: 126,
      render: (ts) => <span className="num muted">{formatTime(ts)}</span>,
    },
    { title: t('logs.colLevel'), dataIndex: 'severity', width: 84, render: (s) => <SeverityTag value={s} /> },
    {
      title: t('logs.colService'),
      dataIndex: 'service',
      width: 190,
      render: (s) => <ServiceBadge name={s} />,
    },
    {
      title: t('logs.colMessage'),
      dataIndex: 'body',
      width: 560,
      ellipsis: true,
      render: (b) => <span className="mono table-cell-strong">{b}</span>,
    },
    {
      title: t('logs.environment'),
      dataIndex: 'environment',
      width: 118,
      ellipsis: true,
      render: (v) => <MetadataCell value={v} />,
    },
    {
      title: t('logs.pod'),
      dataIndex: 'k8sPodName',
      width: 220,
      ellipsis: true,
      render: (v) => <MetadataCell value={v} />,
    },
    {
      title: t('logs.instance'),
      dataIndex: 'serviceInstanceId',
      width: 220,
      ellipsis: true,
      render: (v) => <MetadataCell value={v} />,
    },
    {
      title: t('logs.colTrace'),
      dataIndex: 'traceId',
      width: 132,
      render: (id) => (id ? <CopyableId value={id} short head={8} /> : <span className="muted">—</span>),
    },
    {
      title: t('logs.colSpan'),
      dataIndex: 'spanId',
      width: 132,
      render: (id) => (id ? <CopyableId value={id} short head={8} /> : <span className="muted">—</span>),
    },
  ];

  const serviceOptions = filters?.appServices?.map((s) => ({ label: s, value: s })) || [];
  const severityOptions = filters?.severities?.map((s) => ({ label: s, value: s })) || [];
  const environmentOptions = filters?.environments?.map((v) => ({ label: v, value: v })) || [];
  const namespaceOptions = (filters?.namespaces || filters?.k8sNamespaces || []).map((v) => ({ label: v, value: v }));
  const podOptions = filters?.k8sPodNames?.map((v) => ({ label: v, value: v })) || [];
  const nodeOptions = filters?.k8sNodeNames?.map((v) => ({ label: v, value: v })) || [];
  const instanceOptions = filters?.serviceInstances?.map((v) => ({ label: v, value: v })) || [];

  return (
    <>
      <PageHeader title={t('logs.title')} description={t('logs.description')} />

      <Toolbar className="query-toolbar" style={{ marginBottom: 16 }}>
        <div className="query-filter-group">
          <div className="query-filter-field is-xwide">
            <Text className="query-filter-label">{t('logs.searchPlaceholder')}</Text>
            <Input.Search
              allowClear
              placeholder={t('logs.searchPlaceholder')}
              value={form.q}
              onChange={(e) => setForm((f) => ({ ...f, q: e.target.value }))}
              onSearch={apply}
            />
          </div>
          <div className="query-filter-field">
            <Text className="query-filter-label">{t('logs.service')}</Text>
            <Select
              allowClear
              showSearch
              placeholder={t('logs.service')}
              options={serviceOptions}
              value={form.service}
              onChange={(v) => {
                setForm((f) => ({ ...f, service: v }));
                setApplied((f) => ({ ...f, service: v }));
              }}
            />
          </div>
          <div className="query-filter-field is-wide">
            <Text className="query-filter-label">{t('logs.severity')}</Text>
            <Select
              mode="multiple"
              allowClear
              placeholder={t('logs.severity')}
              maxTagCount="responsive"
              options={severityOptions}
              value={form.severities}
              onChange={(v) => {
                setForm((f) => ({ ...f, severities: v }));
                setApplied((f) => ({ ...f, severities: v }));
              }}
            />
          </div>
          <div className="query-filter-field">
            <Text className="query-filter-label">{t('logs.environment')}</Text>
            <Select
              allowClear
              showSearch
              placeholder={t('logs.environment')}
              options={environmentOptions}
              value={form.environment}
              onChange={(v) => {
                setForm((f) => ({ ...f, environment: v }));
                setApplied((f) => ({ ...f, environment: v }));
              }}
            />
          </div>
          <div className="query-filter-field">
            <Text className="query-filter-label">{t('logs.namespace')}</Text>
            <Select
              allowClear
              showSearch
              placeholder={t('logs.namespace')}
              options={namespaceOptions}
              value={form.namespace}
              onChange={(v) => {
                setForm((f) => ({ ...f, namespace: v }));
                setApplied((f) => ({ ...f, namespace: v }));
              }}
            />
          </div>
          <div className="query-filter-field is-wide">
            <Text className="query-filter-label">{t('logs.pod')}</Text>
            <Select
              allowClear
              showSearch
              placeholder={t('logs.pod')}
              options={podOptions}
              value={form.k8sPodName}
              onChange={(v) => {
                setForm((f) => ({ ...f, k8sPodName: v }));
                setApplied((f) => ({ ...f, k8sPodName: v }));
              }}
            />
          </div>
          <div className="query-filter-field">
            <Text className="query-filter-label">{t('logs.node')}</Text>
            <Select
              allowClear
              showSearch
              placeholder={t('logs.node')}
              options={nodeOptions}
              value={form.k8sNodeName}
              onChange={(v) => {
                setForm((f) => ({ ...f, k8sNodeName: v }));
                setApplied((f) => ({ ...f, k8sNodeName: v }));
              }}
            />
          </div>
          <div className="query-filter-field is-wide">
            <Text className="query-filter-label">{t('logs.instance')}</Text>
            <Select
              allowClear
              showSearch
              placeholder={t('logs.instance')}
              options={instanceOptions}
              value={form.serviceInstanceId}
              onChange={(v) => {
                setForm((f) => ({ ...f, serviceInstanceId: v }));
                setApplied((f) => ({ ...f, serviceInstanceId: v }));
              }}
            />
          </div>
          {traceId && (
            <Tag
              className="query-filter-chip"
              closable
              onClose={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('traceId');
                next.delete('spanId');
                setSearchParams(next);
              }}
            >
              trace_id: {traceId.slice(0, 12)}…
            </Tag>
          )}
          {spanId && (
            <Tag
              className="query-filter-chip"
              closable
              onClose={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('spanId');
                setSearchParams(next);
              }}
            >
              span_id: {spanId.slice(0, 12)}…
            </Tag>
          )}
        </div>
      </Toolbar>

      <Card size="small" title={t('logs.volumeBySeverity')} style={{ marginBottom: 16 }}>
        <AsyncBoundary loading={loading && !data} error={error} onRetry={refetch} skeleton={<div style={{ height: 150 }} />}>
          {histogramOption && <EChart option={histogramOption} height={150} />}
        </AsyncBoundary>
      </Card>

      <div style={{ marginBottom: 10 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {data ? t('logs.countRecords', { n: formatInt(data.total) }) : t('logs.searching')}
          {data && data.total > data.items.length ? ` · ${t('common.showingFirst', { n: data.items.length })}` : ''}
        </Text>
      </div>

      <Table
        rowKey="id"
        className="data-table"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={data?.items || []}
        pagination={{ pageSize: 25, showSizeChanger: false, size: 'small' }}
        scroll={{ x: 1664 }}
        onRow={(r) => ({ onClick: () => setSelected(r), style: { cursor: 'pointer' } })}
      />

      <LogDetailDrawer log={selected} open={!!selected} onClose={() => setSelected(null)} />
    </>
  );
}
