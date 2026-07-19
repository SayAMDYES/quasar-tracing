/**
 * Service detail side panel for the service map: RED summary, per-endpoint
 * metrics and the upstream/downstream dependency lists (click to traverse).
 *
 * @author Quasar
 */
import { Drawer, Spin, Table, Space, Typography, Button, Tag, Divider } from 'antd';
import { FireOutlined, LineChartOutlined, PartitionOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ServiceBadge } from '@/components/tags';
import useFetch from '@/hooks/useFetch';
import { fetchServiceDetail } from '@/api';
import { formatDuration, formatInt, formatPercent, formatMs } from '@/utils/format';
import { status as statusColors } from '@/theme/tokens';
import { resolveServiceVisual } from '@/utils/serviceVisuals';
import { buildInvestigationPath } from '@/utils/investigationContext';

const { Text } = Typography;

const TYPE_KEY = { app: 'catService', datastore: 'catDatastore', mq: 'catMessaging', external: 'catExternal' };

function Stat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="uppercase-label">{label}</span>
      <span className="num" style={{ fontSize: 17, fontWeight: 600, color: color || 'var(--heading)' }}>
        {value}
      </span>
    </div>
  );
}

function DependencyList({ title, edges, peerKey, onSelectService }) {
  const { t } = useTranslation();
  if (!edges?.length) return null;
  return (
    <>
      <Divider orientation="left" plain>{title}</Divider>
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        {edges.map((e) => (
          <div
            key={e.caller + e.callee}
            onClick={() => onSelectService(e[peerKey])}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            <ServiceBadge name={e[peerKey]} />
            <Space size={12}>
              <span className="num muted" style={{ fontSize: 12 }}>{t('service.calls', { n: formatInt(e.callCount) })}</span>
              <span className="num" style={{ fontSize: 12, color: e.errorRate > 0.05 ? statusColors.error : 'var(--text-muted)' }}>
                {formatPercent(e.errorRate, 1)}
              </span>
            </Space>
          </div>
        ))}
      </Space>
    </>
  );
}

export default function ServicePanel({ name, range, autoRefreshRevision, open, onClose, onSelectService }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data, loading } = useFetch(
    () => (name ? fetchServiceDetail(name, { from: range.from, to: range.to }) : Promise.resolve(null)),
    [name, range.from, range.to],
    { backgroundKey: autoRefreshRevision },
  );
  const visual = data ? resolveServiceVisual(data) : null;
  const investigationContext = name ? {
    from: range.from,
    to: range.to,
    service: name,
  } : null;
  const tracePath = investigationContext
    ? buildInvestigationPath('traces', investigationContext)
    : null;
  const logPath = investigationContext
    ? buildInvestigationPath('logs', investigationContext)
    : null;
  const metricsPath = investigationContext
    ? buildInvestigationPath('metrics', investigationContext)
    : null;
  const openInvestigation = (path) => {
    if (path) navigate(path);
  };

  const endpointColumns = [
    { title: t('service.pOperation'), dataIndex: 'operation', ellipsis: true, render: (o) => <span className="mono table-cell-strong">{o}</span> },
    { title: 'rps', dataIndex: 'rps', align: 'right', width: 70, render: (v) => <span className="num">{v.toFixed(1)}</span> },
    {
      title: t('service.pErr'),
      dataIndex: 'errorRate',
      align: 'right',
      width: 72,
      render: (v) => <span className="num" style={{ color: v > 0.05 ? statusColors.error : 'var(--text-muted)' }}>{formatPercent(v, 1)}</span>,
    },
    { title: 'p99', dataIndex: 'p99', align: 'right', width: 80, render: (v) => <span className="num">{formatMs(v)}</span> },
  ];

  return (
    <Drawer
      rootClassName="investigation-actions-drawer"
      open={open}
      onClose={onClose}
      width={520}
      title={name ? <ServiceBadge name={name} /> : t('metrics.service')}
      extra={
        name && (
          <Space size={6} wrap className="service-panel-investigation-actions">
            <Button
              size="small"
              icon={<PartitionOutlined />}
              disabled={!tracePath}
              onClick={() => openInvestigation(tracePath)}
            >
              {t('nav.traces')}
            </Button>
            <Button
              size="small"
              icon={<FireOutlined />}
              disabled={!logPath}
              onClick={() => openInvestigation(logPath)}
            >
              {t('nav.logs')}
            </Button>
            <Button
              size="small"
              type="primary"
              ghost
              icon={<LineChartOutlined />}
              disabled={!metricsPath}
              onClick={() => openInvestigation(metricsPath)}
            >
              {t('service.metrics')}
            </Button>
          </Space>
        )
      }
    >
      <Spin spinning={loading}>
        {data && (
          <>
            <Space size={28} wrap style={{ marginBottom: 8 }}>
              <Stat label={t('service.throughput')} value={formatInt(data.calls)} />
              <Stat label={t('service.errorRate')} value={formatPercent(data.errorRate)} color={data.errorRate > 0.05 ? statusColors.error : statusColors.ok} />
              <Stat label="p50" value={formatDuration(data.p50)} />
              <Stat label="p90" value={formatDuration(data.p90)} />
              <Stat label="p99" value={formatDuration(data.p99)} color="var(--brand-strong)" />
            </Space>
            <div style={{ marginTop: 4 }}>
              <Tag>{t(`serviceMap.${TYPE_KEY[data.type] || 'catService'}`)}</Tag>
              {visual && (
                <Tag color={visual.color} className="mono">
                  {visual.label}
                </Tag>
              )}
              <span className="muted" style={{ fontSize: 12 }}>
                {t('service.upDown', { up: data.upstreams.length, down: data.downstreams.length })}
              </span>
            </div>

            {data.endpoints.length > 0 && (
              <>
                <Divider orientation="left" plain style={{ marginTop: 20 }}>{t('service.endpoints')}</Divider>
                <Table
                  rowKey="operation"
                  className="data-table"
                  size="small"
                  pagination={false}
                  columns={endpointColumns}
                  dataSource={data.endpoints}
                  scroll={{ x: 440 }}
                />
              </>
            )}

            <DependencyList title={t('service.callsInto')} edges={data.upstreams} peerKey="caller" onSelectService={onSelectService} />
            <DependencyList title={t('service.downstream')} edges={data.downstreams} peerKey="callee" onSelectService={onSelectService} />
          </>
        )}
        {!loading && !data && <Text type="secondary">{t('service.selectHint')}</Text>}
      </Spin>
    </Drawer>
  );
}
