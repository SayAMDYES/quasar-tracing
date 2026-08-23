/**
 * Overview — the monitoring landing page. Top-line KPIs, request/error trends,
 * busiest endpoints, per-service health and the most recent errors. Driven by
 * the global time range from the top bar.
 *
 * @author Quasar
 */
import { useMemo } from 'react';
import { Row, Col, Card, Table, Typography, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EChart from '@/components/EChart';
import AsyncBoundary from '@/components/AsyncBoundary';
import { ServiceBadge, SeverityTag } from '@/components/tags';
import CopyableId from '@/components/CopyableId';
import { useApp } from '@/context/AppContext';
import { useThemeMode } from '@/context/ThemeContext';
import useFetch from '@/hooks/useFetch';
import { fetchOverview } from '@/api';
import { buildThroughputChart, buildErrorRateChart, buildEndpointBar, pickTimeStep } from '@/charts/options';
import { formatNumber, formatPercent, formatInt, formatTime, formatMs } from '@/utils/format';
import { buildInvestigationPath } from '@/utils/investigationContext';
import { brand, status } from '@/theme/tokens';

const { Text } = Typography;
const DEGRADED_ERROR_RATE = 0.02;
const UNHEALTHY_ERROR_RATE = 0.20;

function delta(series, key) {
  if (!series || series.length < 2) return 0;
  const first = series[0][key] || 0.0001;
  const last = series[series.length - 1][key] || 0;
  return ((last - first) / Math.abs(first)) * 100;
}

function serviceHealth(errorRate) {
  if (errorRate >= UNHEALTHY_ERROR_RATE) return 'unhealthy';
  if (errorRate >= DEGRADED_ERROR_RATE) return 'degraded';
  return 'healthy';
}

export default function OverviewPage() {
  const { chartTheme } = useThemeMode();
  const { range, autoRefreshRevision } = useApp();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { data, loading, error, refetch } = useFetch(
    () => fetchOverview({ from: range.from, to: range.to }),
    [range.from, range.to],
    { backgroundKey: autoRefreshRevision },
  );

  const charts = useMemo(() => {
    if (!data) return null;
    const step = pickTimeStep(range.from, range.to);
    const timeExtent = { from: range.from, to: range.to };
    return {
      throughput: buildThroughputChart(data.series, step, timeExtent, chartTheme),
      errorRate: buildErrorRateChart(data.series, step, timeExtent, chartTheme),
      endpoints: buildEndpointBar(data.topEndpoints.slice(0, 7), 'p99', chartTheme),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, range, i18n.language, chartTheme]);

  const openServiceTopology = (service) => {
    const path = buildInvestigationPath('services', {
      from: range.from,
      to: range.to,
      service,
    });
    if (path) navigate(path);
  };

  const healthColumns = [
    { title: t('overview.colService'), dataIndex: 'name', width: 240, render: (name) => <ServiceBadge name={name} /> },
    {
      title: '',
      dataIndex: 'errorRate',
      key: 'health',
      width: 104,
      render: (v) => {
        const health = serviceHealth(v);
        if (health === 'unhealthy') return <Tag color="error">{t('overview.unhealthy')}</Tag>;
        if (health === 'degraded') return <Tag color="warning">{t('overview.degraded')}</Tag>;
        return <Tag color="success">{t('overview.healthy')}</Tag>;
      },
    },
    {
      title: t('overview.colErrorRate'),
      dataIndex: 'errorRate',
      align: 'right',
      width: 120,
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.errorRate - b.errorRate,
      render: (v) => (
        <span className="num" style={{ color: serviceHealth(v) === 'unhealthy' ? status.error : serviceHealth(v) === 'degraded' ? status.warn : status.ok }}>
          {formatPercent(v)}
        </span>
      ),
    },
    {
      title: t('overview.colP99'),
      dataIndex: 'p99',
      align: 'right',
      width: 112,
      sorter: (a, b) => a.p99 - b.p99,
      render: (v) => <span className="num">{formatMs(v / 1e6)}</span>,
    },
    {
      title: t('overview.colThroughput'),
      dataIndex: 'calls',
      align: 'right',
      width: 128,
      sorter: (a, b) => a.calls - b.calls,
      render: (v) => <span className="num">{formatInt(v)}</span>,
    },
  ];

  const errorColumns = [
    { title: t('overview.colService'), dataIndex: 'service', width: 190, render: (s) => <ServiceBadge name={s} /> },
    { title: t('overview.colLevel'), dataIndex: 'severity', width: 80, render: (s) => <SeverityTag value={s} /> },
    {
      title: t('overview.colMessage'),
      dataIndex: 'body',
      ellipsis: true,
      render: (b) => <span className="mono table-cell-strong">{b}</span>,
    },
    {
      title: t('overview.colTime'),
      dataIndex: 'timestamp',
      width: 126,
      render: (ts) => <span className="num muted">{formatTime(ts)}</span>,
    },
    {
      title: t('overview.colTrace'),
      dataIndex: 'traceId',
      width: 138,
      render: (id) =>
        id ? <CopyableId value={id} short head={10} onClick={(v) => navigate(`/traces/${v}`)} /> : <span className="muted">—</span>,
    },
  ];

  const k = data?.kpis;

  return (
    <>
      <PageHeader
        title={t('overview.title')}
        description={t('overview.description', { range: t(`range.${range.key}`) })}
      />
      <AsyncBoundary loading={loading && !data} error={error} onRetry={refetch}>
        {data && (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={12} md={8} xl={4}>
                <StatCard
                  label={t('overview.kpiThroughput')}
                  value={formatNumber(k.rps)}
                  suffix={t('overview.suffixReqs')}
                  tone={brand.primary}
                  delta={delta(data.series, 'requests')}
                  deltaGood
                  spark={data.series.map((p) => p.requests)}
                />
              </Col>
              <Col xs={12} md={8} xl={4}>
                <StatCard
                  label={t('overview.kpiErrorRate')}
                  value={formatPercent(k.errorRate, 2)}
                  tone={status.error}
                  delta={delta(data.series, 'errorRate')}
                  deltaGood={delta(data.series, 'errorRate') <= 0}
                  spark={data.series.map((p) => p.errorRate)}
                />
              </Col>
              <Col xs={12} md={8} xl={4}>
                <StatCard
                  label={t('overview.kpiP99')}
                  value={formatInt(k.p99)}
                  suffix="ms"
                  tone={brand.primaryActive}
                  delta={delta(data.series, 'p99')}
                  deltaGood={delta(data.series, 'p99') <= 0}
                  spark={data.series.map((p) => p.p99)}
                />
              </Col>
              <Col xs={12} md={8} xl={4}>
                <StatCard
                  label={t('overview.kpiTraces')}
                  value={formatInt(k.traceCount)}
                  suffix={t('overview.suffixSampled')}
                  hint={t('overview.tracesHint')}
                />
              </Col>
              <Col xs={12} md={8} xl={4}>
                <StatCard label={t('overview.kpiErrorTraces')} value={formatInt(k.errorTraceCount)} tone={status.error} />
              </Col>
              <Col xs={12} md={8} xl={4}>
                <StatCard
                  label={t('overview.kpiServices')}
                  value={formatInt(k.serviceCount)}
                  suffix={t('overview.suffixServices')}
                  hint={t('overview.servicesHint', { degraded: k.degradedCount || 0, unhealthy: k.unhealthyCount || 0 })}
                  tone={k.unhealthyCount > 0 ? status.error : k.degradedCount > 0 ? status.warn : status.ok}
                />
              </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 4 }}>
              <Col xs={24} xl={14}>
                <Card title={t('overview.cardThroughput')} size="small">
                  <EChart option={charts.throughput} height={240} />
                </Card>
              </Col>
              <Col xs={24} xl={10}>
                <Card title={t('overview.cardErrorRate')} size="small">
                  <EChart option={charts.errorRate} height={240} />
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 4 }}>
              <Col xs={24} xl={10}>
                <Card title={t('overview.cardTopEndpoints')} size="small">
                  <EChart option={charts.endpoints} height={260} />
                </Card>
              </Col>
              <Col xs={24} xl={14}>
                <Card
                  title={t('overview.cardServiceHealth')}
                  size="small"
                  extra={<Text type="secondary" style={{ fontSize: 12 }}>{t('overview.openMapHint')}</Text>}
                >
                  <Table
                    rowKey="name"
                    className="data-table"
                    size="small"
                    pagination={false}
                    columns={healthColumns}
                    dataSource={data.services}
                    scroll={{ x: 704 }}
                    onRow={(r) => ({
                      onClick: () => openServiceTopology(r.name),
                      onKeyDown: (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openServiceTopology(r.name);
                        }
                      },
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': `${t('overview.colService')} ${r.name}`,
                      style: { cursor: 'pointer' },
                    })}
                  />
                </Card>
              </Col>
            </Row>

            <Card title={t('overview.cardRecentErrors')} size="small" style={{ marginTop: 16 }}>
              <Table
                rowKey="id"
                className="data-table"
                size="small"
                pagination={false}
                columns={errorColumns}
                dataSource={data.recentErrors}
                scroll={{ x: 1040 }}
                locale={{ emptyText: <span className="muted">{t('overview.noErrors')}</span> }}
              />
            </Card>
          </>
        )}
      </AsyncBoundary>
    </>
  );
}
