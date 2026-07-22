/**
 * Metrics — service metrics dashboard for RED trends, endpoint breakdowns,
 * instance details, and runtime metric entry points.
 *
 * @author Quasar
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Flex,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  ApartmentOutlined,
  BugOutlined,
  ClockCircleOutlined,
  CloudServerOutlined,
  CodeOutlined,
  ContainerOutlined,
  FireOutlined,
  LineChartOutlined,
  PartitionOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import EChart from '@/components/EChart';
import AsyncBoundary from '@/components/AsyncBoundary';
import { ServiceBadge } from '@/components/tags';
import { useApp } from '@/context/AppContext';
import { useThemeMode } from '@/context/ThemeContext';
import useFetch from '@/hooks/useFetch';
import useInvestigationRange from '@/hooks/useInvestigationRange';
import { fetchMetrics, fetchFilters } from '@/api';
import {
  buildThroughputChart,
  buildErrorRateChart,
  buildLatencyChart,
} from '@/charts/options';
import PageHeader from '@/components/PageHeader';
import { formatInt, formatMs, formatNumber, formatPercent } from '@/utils/format';
import { buildInvestigationPath } from '@/utils/investigationContext';
import { brand, neutral, percentileColors, status } from '@/theme/tokens';

const { Text, Title } = Typography;

const metricTone = {
  primary: brand.primary,
  orange: brand.primaryActive || brand.primary,
  info: status.info || brand.primary,
  success: status.ok,
  warn: status.warn,
  error: status.error,
  neutral: neutral.textSecondary,
};

const surfaceCardStyle = {
  height: '100%',
  borderRadius: 14,
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-card)',
};

function MetricStyles() {
  return (
    <style>
      {`
        .metrics-dashboard-shell {
          position: relative;
          padding-bottom: 10px;
        }

        .metrics-dashboard-card {
          animation: metrics-panel-enter 360ms ease both;
        }

        .metrics-dashboard-overview {
          border-color: rgba(242, 106, 27, 0.16) !important;
          background:
            linear-gradient(135deg, rgba(242, 106, 27, 0.045), rgba(46, 125, 209, 0.035)),
            var(--surface);
        }

        .metrics-dashboard-toolbar {
          margin-bottom: 16px;
          border-color: rgba(242, 106, 27, 0.16) !important;
          background:
            linear-gradient(135deg, rgba(242, 106, 27, 0.035), rgba(46, 125, 209, 0.025)),
            var(--surface);
        }

        .metrics-dashboard-toolbar .ant-card-body {
          padding: 12px 16px;
        }

        .metrics-operation-bar {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }

        .metrics-operation-actions {
          display: flex;
          align-items: flex-end;
          gap: 8px;
        }

        .metrics-filter-group {
          display: flex;
          align-items: end;
          flex-wrap: wrap;
          gap: 10px;
        }

        .metrics-filter-field {
          min-width: 236px;
        }

        .metrics-filter-label {
          display: block;
          margin-bottom: 6px;
          color: ${neutral.textSecondary};
          font-size: 12px;
          line-height: 1;
        }

        .metrics-dashboard-kpi {
          overflow: hidden;
          position: relative;
          transition:
            transform 160ms ease,
            border-color 160ms ease,
            box-shadow 160ms ease;
        }

        .metrics-dashboard-kpi::before {
          content: '';
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: 3px;
          background: var(--metric-tone, ${brand.primary});
          opacity: 0.9;
        }

        .metrics-dashboard-kpi:hover {
          transform: translateY(-2px);
          border-color: rgba(242, 106, 27, 0.22) !important;
          box-shadow: var(--shadow-pop) !important;
        }

        .metrics-dashboard-kpi-icon {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--metric-tone, ${brand.primary});
        }

        .metrics-dashboard-mini-chart {
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface);
        }

        .metrics-dashboard-light-card {
          transition:
            transform 180ms ease,
            box-shadow 180ms ease,
            border-color 180ms ease;
        }

        .metrics-dashboard-light-card:hover {
          transform: translateY(-2px);
          border-color: rgba(242, 106, 27, 0.24) !important;
          box-shadow: var(--shadow-pop) !important;
        }

        .metrics-instance-expanded {
          padding: 4px 8px 8px 44px;
          animation: metrics-expand 260ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .metrics-dashboard-shell .ant-table-row-expand-icon {
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            color 180ms ease;
        }

        .metrics-dashboard-shell .ant-table-row-expand-icon-expanded {
          transform: rotate(90deg);
          border-color: ${brand.primary};
          color: ${brand.primary};
        }

        .metrics-dashboard-shell .metrics-endpoint-actions {
          justify-content: flex-end;
          width: 100%;
        }

        @keyframes metrics-panel-enter {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes metrics-expand {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .metrics-dashboard-card,
          .metrics-instance-expanded {
            animation: none !important;
          }

          .metrics-dashboard-kpi,
          .metrics-dashboard-light-card {
            transition: none !important;
          }
        }

        @media (max-width: 720px) {
          .metrics-operation-bar {
            align-items: stretch;
          }

          .metrics-filter-group,
          .metrics-operation-actions,
          .metrics-filter-field {
            width: 100%;
          }

          .metrics-filter-field {
            min-width: 100%;
          }

          .metrics-operation-actions .ant-btn {
            flex: 1;
          }
        }
      `}
    </style>
  );
}

function normalizeSeries(series) {
  return (series || []).map((point) => ({
    ...point,
    time: Number(point.time),
    requests: Number(point.requests || 0),
    errors: Number(point.errors || 0),
    errorRate: Number(point.errorRate || 0),
    p50: Number(point.p50 || 0),
    p90: Number(point.p90 || 0),
    p99: Number(point.p99 || 0),
  }));
}

function normalizeEndpoints(endpoints) {
  return (endpoints || []).map((endpoint) => ({
    ...endpoint,
    requestCount: Number(endpoint.requestCount || 0),
    rps: Number(endpoint.rps || 0),
    errorRate: Number(endpoint.errorRate || 0),
    p50: Number(endpoint.p50 || 0),
    p90: Number(endpoint.p90 || 0),
    p99: Number(endpoint.p99 || 0),
  }));
}

function normalizeInstances(instances) {
  return (instances || []).map((instance) => ({
    ...instance,
    requestCount: Number(instance.requestCount || 0),
    rps: Number(instance.rps || 0),
    errorRate: Number(instance.errorRate || 0),
    p99: Number(instance.p99 || 0),
    resourceAttributes: instance.resourceAttributes || {},
  }));
}

function normalizeJvm(jvm) {
  if (!jvm) return null;
  return {
    heapUsed: Number(jvm.heapUsed || 0),
    heapLimit: Number(jvm.heapLimit || 0),
    cpuUtilization: Number(jvm.cpuUtilization || 0),
    threadCount: Number(jvm.threadCount || 0),
    gcDuration: Number(jvm.gcDuration || 0),
  };
}

function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return '—';
  const value = Number(bytes);
  if (Math.abs(value) >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (Math.abs(value) >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (Math.abs(value) >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${formatInt(value)} B`;
}

function progressPercent(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function latest(series) {
  return series.length ? series[series.length - 1] : null;
}

function previous(series) {
  return series.length > 8 ? series[series.length - 9] : series[0] || null;
}

function delta(current, base) {
  return base ? (current - base) / Math.max(Math.abs(base), 0.000001) : 0;
}

function healthTone(value, warn, bad) {
  if (value >= bad) return status.error;
  if (value >= warn) return status.warn;
  return status.ok;
}

function runtimeMeta(type) {
  if (type === 'pod') return { labelKey: 'runtime.kubernetesPod', icon: <CloudServerOutlined />, color: status.info };
  if (type === 'docker') return { labelKey: 'runtime.dockerCompose', icon: <ContainerOutlined />, color: metricTone.orange };
  return { labelKey: 'runtime.bareJava', icon: <CodeOutlined />, color: status.neutral };
}

function resourceValue(attrs, key) {
  const value = attrs?.[key];
  return value == null || value === '' ? '—' : value;
}

function languageOf(instance) {
  return String(instance?.resourceAttributes?.['telemetry.sdk.language'] || '').toLowerCase();
}

function isJavaInstance(instance) {
  const attrs = instance?.resourceAttributes || {};
  const language = languageOf(instance);
  const runtimeName = String(attrs['process.runtime.name'] || attrs['process.runtime.description'] || '').toLowerCase();
  return language === 'java' || runtimeName.includes('java') || runtimeName.includes('jvm');
}

function setMetricsSearchParams(setSearchParams, values) {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    Object.entries(values).forEach(([key, value]) => {
      if (value == null || value === '' || value === 'all') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });
    return next;
  });
}

function SectionTitle({ title, icon }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Space size={8} align="center">
        {icon && <span style={{ color: brand.primary }}>{icon}</span>}
        <Title level={5} style={{ margin: 0, color: neutral.heading }}>
          {title}
        </Title>
      </Space>
    </div>
  );
}

function KpiCard({ icon, label, value, suffix, tone, deltaValue }) {
  const stable = label === 'RPS' ? deltaValue >= 0 : deltaValue <= 0;
  return (
    <Card
      className="metrics-dashboard-kpi"
      style={{ ...surfaceCardStyle, '--metric-tone': tone }}
      styles={{ body: { padding: 16 } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <Avatar
          className="metrics-dashboard-kpi-icon"
          icon={icon}
          style={{
            color: tone,
            background: `${tone}12`,
            border: `1px solid ${tone}28`,
          }}
        />
        <Tag
          color={stable ? 'success' : 'warning'}
          style={{
            marginInlineEnd: 0,
            borderColor: stable ? 'rgba(56, 217, 150, 0.42)' : 'rgba(242, 106, 27, 0.42)',
            background: stable ? 'rgba(56, 217, 150, 0.14)' : 'rgba(242, 106, 27, 0.14)',
            color: stable ? metricTone.success : metricTone.orange,
          }}
        >
          {deltaValue >= 0 ? '+' : ''}
          {(deltaValue * 100).toFixed(1)}%
        </Tag>
      </div>
      <Statistic
        title={<Text className="uppercase-label" style={{ color: neutral.textMuted }}>{label}</Text>}
        value={value}
        suffix={suffix}
        valueStyle={{ fontSize: 30, lineHeight: 1, fontWeight: 760, color: neutral.heading }}
      />
    </Card>
  );
}

function InstancePanel({ instances, selectedInstanceId, onInstanceChange }) {
  const { t } = useTranslation();
  const podCount = instances.filter((item) => item.runtimeType === 'pod').length;
  const dockerCount = instances.filter((item) => item.runtimeType === 'docker').length;
  const bareCount = instances.filter((item) => item.runtimeType === 'bare').length;
  const expandedKeys = selectedInstanceId === 'all'
    ? instances.slice(0, 1).map((item) => item.serviceInstanceId)
    : instances.map((item) => item.serviceInstanceId);

  const columns = [
    {
      title: t('metrics.colInstanceName'),
      dataIndex: 'displayName',
      width: 360,
      ellipsis: true,
      render: (value, instance) => {
        const meta = runtimeMeta(instance.runtimeType);
        return (
          <Space size={8}>
            <span style={{ color: meta.color }}>{meta.icon}</span>
            <span className="mono table-cell-strong">
              {value || instance.serviceInstanceId}
            </span>
          </Space>
        );
      },
    },
    {
      title: t('metrics.colRuntime'),
      dataIndex: 'runtimeType',
      width: 160,
      render: (value) => {
        const meta = runtimeMeta(value);
        return (
          <Tag color={value === 'pod' ? 'blue' : value === 'docker' ? 'orange' : 'default'} style={{ marginInlineEnd: 0 }}>
            {t(meta.labelKey)}
          </Tag>
        );
      },
    },
    { title: t('metrics.colRps'), dataIndex: 'rps', align: 'right', width: 96, render: (value) => <span className="num">{value.toFixed(1)}</span> },
    {
      title: t('metrics.colErrorRate'),
      dataIndex: 'errorRate',
      align: 'right',
      width: 112,
      render: (value) => (
        <span className="num" style={{ color: value > 0.05 ? status.error : value > 0.02 ? status.warn : neutral.text }}>
          {formatPercent(value)}
        </span>
      ),
    },
    {
      title: 'p99',
      dataIndex: 'p99',
      align: 'right',
      width: 104,
      render: (value) => (
        <span className="num" style={{ color: value > 900 ? status.error : value > 500 ? status.warn : neutral.text }}>
          {formatMs(value)}
        </span>
      ),
    },
  ];

  const expandedRowRender = (instance) => {
    const attrs = instance.resourceAttributes || {};
    const resourceAttrs = [
      ['service.instance.id', instance.serviceInstanceId],
      ['host.name', resourceValue(attrs, 'host.name')],
      ['container.id', resourceValue(attrs, 'container.id')],
      ['container.name', resourceValue(attrs, 'container.name')],
      ['container.image.name', resourceValue(attrs, 'container.image.name')],
      ['k8s.namespace.name', resourceValue(attrs, 'k8s.namespace.name')],
      ['k8s.pod.name', resourceValue(attrs, 'k8s.pod.name')],
      ['k8s.pod.uid', resourceValue(attrs, 'k8s.pod.uid')],
      ['k8s.node.name', resourceValue(attrs, 'k8s.node.name')],
      ['telemetry.sdk.language', resourceValue(attrs, 'telemetry.sdk.language')],
    ];

    return (
      <div className="metrics-instance-expanded">
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, sm: 2, xl: 3 }}
          items={resourceAttrs.map(([label, value]) => ({
            key: label,
            label: <Text className="mono" type="secondary" style={{ fontSize: 11, wordBreak: 'break-all' }}>{label}</Text>,
            children: <Text className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{value}</Text>,
          }))}
        />
      </div>
    );
  };

  return (
    <Card className="metrics-dashboard-light-card" style={{ ...surfaceCardStyle, marginTop: 16 }} styles={{ body: { padding: 16 } }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <SectionTitle title={t('metrics.cardInstanceDetail')} />
        <Space size={8} wrap>
          <Tag color="blue">{podCount} Pod</Tag>
          <Tag color="orange">{dockerCount} Docker</Tag>
          <Tag>{bareCount} Bare Java</Tag>
        </Space>
      </div>
      {instances.length ? (
        <Table
          rowKey="serviceInstanceId"
          className="data-table"
          size="small"
          pagination={false}
          columns={columns}
          dataSource={instances}
          scroll={{ x: 832 }}
          expandable={{
            defaultExpandedRowKeys: expandedKeys,
            expandedRowRender,
          }}
        />
      ) : (
        <Empty description={t('common.noData')} />
      )}
    </Card>
  );
}

function RuntimeMetricCard({ title, children }) {
  return (
    <Card className="metrics-dashboard-light-card" style={surfaceCardStyle} styles={{ body: { padding: 16 } }}>
      <SectionTitle title={title} />
      {children}
    </Card>
  );
}

function JvmMetricCard({ jvm }) {
  const { t } = useTranslation();
  const heapPercent = jvm?.heapLimit > 0 ? (jvm.heapUsed / jvm.heapLimit) * 100 : 0;
  const rows = [
    {
      label: t('metrics.jvmHeapUsed'),
      value: jvm ? `${formatBytes(jvm.heapUsed)} / ${formatBytes(jvm.heapLimit)}` : '—',
      percent: progressPercent(heapPercent),
      color: percentileColors.p90,
    },
    {
      label: t('metrics.jvmCpuUsage'),
      value: jvm ? formatPercent(jvm.cpuUtilization, 2) : '—',
      percent: progressPercent((jvm?.cpuUtilization || 0) * 100),
      color: status.warn,
    },
    {
      label: t('metrics.jvmLiveThreads'),
      value: jvm ? formatInt(jvm.threadCount) : '—',
      percent: progressPercent((jvm?.threadCount || 0) / 2),
      color: status.info,
    },
    {
      label: t('metrics.jvmGcDuration'),
      value: jvm ? formatMs(jvm.gcDuration) : '—',
      percent: progressPercent((jvm?.gcDuration || 0) / 2),
      color: status.ok,
    },
  ];

  return (
    <RuntimeMetricCard
      title={t('metrics.cardJvm')}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {rows.map((row) => (
          <div key={row.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text>{row.label}</Text>
              <Text className="mono" type="secondary">{row.value}</Text>
            </div>
            <Progress percent={row.percent} strokeColor={row.color} showInfo={false} />
          </div>
        ))}
      </Space>
    </RuntimeMetricCard>
  );
}

export default function MetricsPage() {
  const { chartTheme } = useThemeMode();
  const { autoRefreshRevision } = useApp();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const effectiveRange = useInvestigationRange(searchParams);
  const [endpointMode, setEndpointMode] = useState('unhealthy');
  const requestedService = searchParams.get('service');
  const requestedEnvironment = searchParams.get('environment') || undefined;
  const requestedNamespace = searchParams.get('namespace') || undefined;
  const requestedInstance = searchParams.get('serviceInstanceId') || searchParams.get('instance') || 'all';

  const { data: filters } = useFetch(fetchFilters, []);
  const serviceOptions =
    filters?.appServices?.map((s) => ({
      value: s,
      label: <ServiceBadge name={s} />,
    })) || [];
  const serviceNames = serviceOptions.map((option) => option.value);
  const service = serviceNames.includes(requestedService) ? requestedService : serviceNames[0];
  const environmentOptions = filters?.environments?.map((v) => ({ label: v, value: v })) || [];
  const namespaceOptions = (filters?.namespaces || filters?.k8sNamespaces || []).map((v) => ({ label: v, value: v }));

  useEffect(() => {
    if (!filters?.appServices?.length || requestedService === service) return;
    setMetricsSearchParams(setSearchParams, { service, serviceInstanceId: 'all', instance: 'all' });
  }, [filters?.appServices, requestedService, service, setSearchParams]);

  const metricsRequestKey = JSON.stringify([
    service,
    requestedEnvironment,
    requestedNamespace,
    requestedInstance,
    effectiveRange.from,
    effectiveRange.to,
  ]);
  const { data: metricsResult, loading, error, refetch } = useFetch(
    () => fetchMetrics({
      service,
      environment: requestedEnvironment,
      namespace: requestedNamespace,
      serviceInstanceId: requestedInstance === 'all' ? undefined : requestedInstance,
      from: effectiveRange.from,
      to: effectiveRange.to,
    }).then((value) => ({ requestKey: metricsRequestKey, value })),
    [metricsRequestKey],
    { immediate: Boolean(service), backgroundKey: autoRefreshRevision },
  );
  const data = metricsResult?.requestKey === metricsRequestKey ? metricsResult.value : null;

  const series = useMemo(() => normalizeSeries(data?.series), [data?.series]);
  const endpoints = useMemo(() => normalizeEndpoints(data?.endpoints), [data?.endpoints]);
  const instances = useMemo(() => normalizeInstances(data?.instances), [data?.instances]);
  const jvm = useMemo(() => normalizeJvm(data?.jvm), [data?.jvm]);
  const selectedInstanceId = requestedInstance !== 'all' && instances.some((item) => item.serviceInstanceId === requestedInstance)
    ? requestedInstance
    : 'all';
  const visibleInstances = useMemo(
    () => selectedInstanceId === 'all'
      ? instances
      : instances.filter((instance) => instance.serviceInstanceId === selectedInstanceId),
    [instances, selectedInstanceId],
  );
  const selectedInstance = selectedInstanceId === 'all'
    ? null
    : visibleInstances[0];
  const javaInstances = visibleInstances.filter(isJavaInstance);
  const shouldShowJvm = selectedInstanceId === 'all'
    ? javaInstances.length > 0
    : Boolean(selectedInstance && isJavaInstance(selectedInstance));

  useEffect(() => {
    if (!data || loading || requestedInstance === 'all' || selectedInstanceId === requestedInstance) return;
    setMetricsSearchParams(setSearchParams, { serviceInstanceId: 'all', instance: 'all' });
  }, [data, loading, requestedInstance, selectedInstanceId, setSearchParams]);

  const charts = useMemo(() => {
    if (!data) return null;
    const timeExtent = { from: effectiveRange.from, to: effectiveRange.to };
    return {
      throughput: buildThroughputChart(series, data.step, timeExtent, chartTheme),
      errorRate: buildErrorRateChart(series, data.step, timeExtent, chartTheme),
      latency: buildLatencyChart(series, data.step, timeExtent, chartTheme),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, series, effectiveRange.from, effectiveRange.to, i18n.language, chartTheme]);

  const current = data?.summary?.current ? {
    ...data.summary.current,
    errorRate: Number(data.summary.current.errorRate || 0),
  } : latest(series);
  const base = previous(series);
  const summary = data?.summary || {};
  const selectedInstanceRps = visibleInstances.reduce((total, instance) => total + instance.rps, 0);
  const selectedInstanceP99 = visibleInstances.length
    ? Math.max(...visibleInstances.map((instance) => instance.p99))
    : 0;
  const selectedInstanceErrorRate = selectedInstanceRps > 0
    ? visibleInstances.reduce((total, instance) => total + instance.errorRate * instance.rps, 0) / selectedInstanceRps
    : visibleInstances[0]?.errorRate || 0;
  const currentRps = selectedInstanceId === 'all' ? (current?.requests ?? summary.rps ?? 0) : selectedInstanceRps;
  const currentErrorRatio = current ? current.errorRate / 100 : summary.errorRate || 0;
  const displayErrorRatio = selectedInstanceId === 'all' ? currentErrorRatio : selectedInstanceErrorRate;
  const currentP99 = selectedInstanceId === 'all' ? (current?.p99 ?? summary.p99 ?? 0) : selectedInstanceP99;
  const baseErrorRatio = base ? base.errorRate / 100 : currentErrorRatio;
  const unhealthyEndpoints = endpoints.filter((endpoint) => endpoint.errorRate > 0.02 || endpoint.p99 > 800);
  const showAllEndpoints = endpointMode === 'all' || (endpointMode === 'unhealthy' && !unhealthyEndpoints.length);
  const endpointRows = showAllEndpoints ? endpoints : unhealthyEndpoints;
  const showNoUnhealthyEndpoints = endpointMode === 'unhealthy' && endpoints.length > 0 && !unhealthyEndpoints.length;
  const errorTone = healthTone(displayErrorRatio, 0.015, 0.05);
  const p99Tone = healthTone(currentP99, 500, 900);
  const defaultService = serviceNames[0];
  const resetDisabled = selectedInstanceId === 'all' && service === defaultService
    && !requestedEnvironment && !requestedNamespace;
  const openInvestigation = (destination, context) => {
    const path = buildInvestigationPath(destination, context);
    if (path) navigate(path);
  };
  const endpointColumns = [
    {
      title: t('metrics.colOperation'),
      dataIndex: 'operation',
      ellipsis: true,
      render: (value, row) => (
        <Space direction="vertical" size={2}>
          <span className="mono table-cell-strong" style={{ color: neutral.heading }}>
            {value}
          </span>
        </Space>
      ),
    },
    { title: t('metrics.colRequests'), dataIndex: 'requestCount', align: 'right', width: 112, sorter: (a, b) => a.requestCount - b.requestCount, render: formatInt },
    { title: t('metrics.colRps'), dataIndex: 'rps', align: 'right', width: 96, render: (v) => <span className="num">{v.toFixed(1)}</span> },
    {
      title: t('metrics.colErrorRate'),
      dataIndex: 'errorRate',
      align: 'right',
      width: 112,
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.errorRate - b.errorRate,
      render: (v) => (
        <Tag color={v > 0.05 ? 'error' : v > 0.02 ? 'warning' : 'success'} style={{ marginInlineEnd: 0 }}>
          {formatPercent(v)}
        </Tag>
      ),
    },
    { title: 'p90', dataIndex: 'p90', align: 'right', width: 104, render: (v) => <span className="num">{formatMs(v)}</span> },
    {
      title: 'p99',
      dataIndex: 'p99',
      align: 'right',
      width: 104,
      sorter: (a, b) => a.p99 - b.p99,
      render: (v) => (
        <span className="num" style={{ color: v > 900 ? status.error : v > 500 ? status.warn : neutral.text }}>
          {formatMs(v)}
        </span>
      ),
    },
    {
      title: t('metrics.colDrilldown'),
      key: 'actions',
      align: 'right',
      width: 190,
      render: (_, row) => (
        <Space size={6} className="metrics-endpoint-actions">
          <Button
            size="small"
            icon={<PartitionOutlined />}
            onClick={() => openInvestigation('traces', {
              from: effectiveRange.from,
              to: effectiveRange.to,
              service,
              operation: row.operation,
              environment: requestedEnvironment,
              namespace: requestedNamespace,
              serviceInstanceId: selectedInstanceId === 'all' ? undefined : selectedInstanceId,
            })}
          >
            {t('traceDetail.trace')}
          </Button>
          <Button
            size="small"
            icon={<FireOutlined />}
            onClick={() => openInvestigation('logs', {
              from: effectiveRange.from,
              to: effectiveRange.to,
              service,
              q: row.operation,
              environment: requestedEnvironment,
              namespace: requestedNamespace,
              serviceInstanceId: selectedInstanceId === 'all' ? undefined : selectedInstanceId,
            })}
          >
            {t('nav.logs')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="metrics-dashboard-shell">
      <MetricStyles />
      <PageHeader title={t('metrics.title')} />

      {serviceOptions.length > 0 && (
        <Card
          className="metrics-dashboard-card metrics-dashboard-toolbar"
          style={surfaceCardStyle}
        >
          <div className="metrics-operation-bar">
            <div className="metrics-filter-group">
              <div className="metrics-filter-field">
                <Text className="metrics-filter-label">{t('metrics.service')}</Text>
                <Select
                  showSearch
                  style={{ width: '100%' }}
                  value={service}
                  options={serviceOptions}
                  onChange={(v) => setMetricsSearchParams(setSearchParams, { service: v, serviceInstanceId: 'all', instance: 'all' })}
                  optionLabelProp="label"
                  filterOption={(input, opt) => opt.value.toLowerCase().includes(input.toLowerCase())}
                />
              </div>
              <div className="metrics-filter-field">
                <Text className="metrics-filter-label">{t('metrics.environment')}</Text>
                <Select
                  allowClear
                  showSearch
                  style={{ width: '100%' }}
                  value={requestedEnvironment}
                  options={environmentOptions}
                  onChange={(v) => setMetricsSearchParams(setSearchParams, {
                    environment: v,
                    serviceInstanceId: 'all',
                    instance: 'all',
                  })}
                />
              </div>
              <div className="metrics-filter-field">
                <Text className="metrics-filter-label">{t('metrics.namespace')}</Text>
                <Select
                  allowClear
                  showSearch
                  style={{ width: '100%' }}
                  value={requestedNamespace}
                  options={namespaceOptions}
                  onChange={(v) => setMetricsSearchParams(setSearchParams, {
                    namespace: v,
                    serviceInstanceId: 'all',
                    instance: 'all',
                  })}
                />
              </div>
              <div className="metrics-filter-field" style={{ minWidth: 280 }}>
                <Text className="metrics-filter-label">{t('metrics.instance')}</Text>
                <Select
                  showSearch
                  style={{ width: '100%' }}
                  value={selectedInstanceId}
                  onChange={(v) => setMetricsSearchParams(setSearchParams, { serviceInstanceId: v, instance: 'all' })}
                  options={[
                    { value: 'all', label: t('metrics.allInstancesCount', { n: instances.length }), labelText: t('metrics.allInstances') },
                    ...instances.map((instance) => {
                      const displayName = instance.displayName || instance.serviceInstanceId;
                      const meta = runtimeMeta(instance.runtimeType);
                      return {
                        value: instance.serviceInstanceId,
                        label: `${displayName} · ${t(meta.labelKey)}`,
                        labelText: `${displayName} ${instance.serviceInstanceId} ${t(meta.labelKey)}`,
                      };
                    }),
                  ]}
                  filterOption={(input, opt) => String(opt?.labelText || opt?.value || '').toLowerCase().includes(input.toLowerCase())}
                />
              </div>
              <div className="metrics-operation-actions">
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  loading={loading}
                  onClick={refetch}
                  disabled={!service}
                >
                  {t('common.refresh')}
                </Button>
                <Button
                  icon={<UndoOutlined />}
                  disabled={!defaultService || resetDisabled}
                  onClick={() => setMetricsSearchParams(setSearchParams, {
                    service: defaultService,
                    environment: undefined,
                    namespace: undefined,
                    serviceInstanceId: 'all',
                    instance: 'all',
                  })}
                >
                  {t('metrics.reset')}
                </Button>
              </div>
            </div>
          </div>

        </Card>
      )}

      <AsyncBoundary loading={loading && !data} error={error} onRetry={refetch}>
        {data && charts && (
          <>
            <Card
              className="metrics-dashboard-card metrics-dashboard-overview"
              style={{ ...surfaceCardStyle, marginBottom: 16 }}
              styles={{ body: { padding: 18 } }}
            >
              <Flex justify="space-between" gap={16} wrap="wrap" align="flex-start" style={{ marginBottom: 18 }}>
                <div>
                  <Title level={4} style={{ margin: 0, color: neutral.heading, letterSpacing: -0.4 }}>
                    {t('metrics.serviceMetrics')}
                  </Title>
                </div>
              </Flex>

              <Row gutter={[16, 16]}>
                <Col xs={24} md={12} xl={6}>
                  <KpiCard
                    icon={<ThunderboltOutlined />}
                    label={t('metrics.colRps')}
                    value={formatNumber(currentRps)}
                    suffix="req/s"
                    tone={metricTone.primary}
                    deltaValue={delta(currentRps, base?.requests)}
                  />
                </Col>
                <Col xs={24} md={12} xl={6}>
                  <KpiCard
                    icon={<BugOutlined />}
                    label={t('metrics.kErrorRate')}
                    value={formatPercent(displayErrorRatio)}
                    tone={errorTone}
                    deltaValue={selectedInstanceId === 'all' ? delta(displayErrorRatio, baseErrorRatio) : 0}
                  />
                </Col>
                <Col xs={24} md={12} xl={6}>
                  <KpiCard
                    icon={<ClockCircleOutlined />}
                    label={t('metrics.kP99')}
                    value={formatInt(currentP99)}
                    suffix="ms"
                    tone={p99Tone}
                    deltaValue={delta(currentP99, base?.p99)}
                  />
                </Col>
                <Col xs={24} md={12} xl={6}>
                  <KpiCard
                    icon={<ApartmentOutlined />}
                    label={t('metrics.kInstances')}
                    value={selectedInstanceId === 'all' ? instances.length : 1}
                    tone={metricTone.success}
                    deltaValue={0}
                  />
                </Col>
              </Row>

            </Card>

            <Card className="metrics-dashboard-light-card" style={{ ...surfaceCardStyle, marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
              <SectionTitle
                icon={<LineChartOutlined />}
                title={t('metrics.cardRedTrend')}
              />
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                  <div className="metrics-dashboard-mini-chart" style={{ padding: 12 }}>
                    <Text style={{ color: neutral.heading, fontWeight: 600 }}>{t('metrics.chartRequestRate')}</Text>
                    <EChart option={charts.throughput} height={230} />
                  </div>
                </Col>
                <Col xs={24} lg={12}>
                  <div className="metrics-dashboard-mini-chart" style={{ padding: 12 }}>
                    <Text style={{ color: neutral.heading, fontWeight: 600 }}>{t('metrics.chartErrorRate')}</Text>
                    <EChart option={charts.errorRate} height={230} />
                  </div>
                </Col>
                <Col xs={24}>
                  <div className="metrics-dashboard-mini-chart" style={{ padding: 12 }}>
                    <Text style={{ color: neutral.heading, fontWeight: 600 }}>{t('metrics.chartLatencyPercentiles')}</Text>
                    <EChart option={charts.latency} height={260} />
                  </div>
                </Col>
              </Row>
            </Card>

            <Card className="metrics-dashboard-light-card" style={{ ...surfaceCardStyle, marginTop: 16 }} styles={{ body: { padding: 16 } }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <SectionTitle title={t('metrics.cardEndpoints')} />
                <Segmented
                  value={endpointMode}
                  onChange={setEndpointMode}
                  options={[
                    { value: 'unhealthy', label: t('metrics.endpointModeUnhealthy') },
                    { value: 'all', label: t('metrics.endpointModeAll') },
                  ]}
                />
              </div>
              <Table rowKey="operation" className="data-table" size="small" pagination={false} columns={endpointColumns} dataSource={endpointRows} scroll={{ x: 920 }} />
              {showNoUnhealthyEndpoints && (
                <Alert
                  style={{ marginTop: 12 }}
                  type="success"
                  showIcon
                  message={t('metrics.noUnhealthyEndpoints')}
                />
              )}
            </Card>

            <InstancePanel
              instances={visibleInstances}
              selectedInstanceId={selectedInstanceId}
              onInstanceChange={(v) => setMetricsSearchParams(setSearchParams, { serviceInstanceId: v, instance: 'all' })}
            />

            {shouldShowJvm && (
              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24}>
                  <JvmMetricCard jvm={jvm} />
                </Col>
              </Row>
            )}
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}
