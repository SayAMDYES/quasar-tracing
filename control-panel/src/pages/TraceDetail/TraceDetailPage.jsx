/**
 * Trace Detail — span waterfall, a click-through span drawer, and the logs
 * correlated to this trace. Reconstructs the timeline from the flat span list.
 *
 * @author Quasar
 */
import { useMemo, useState } from 'react';
import { Card, Tabs, Badge, Space, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/PageHeader';
import AsyncBoundary from '@/components/AsyncBoundary';
import TraceWaterfall from '@/components/TraceWaterfall';
import SpanDetailDrawer from '@/components/SpanDetailDrawer';
import CopyableId from '@/components/CopyableId';
import { SpanStatusTag, EnvTag, ServiceBadge } from '@/components/tags';
import RelatedLogs from './RelatedLogs';
import useFetch from '@/hooks/useFetch';
import { fetchTrace, fetchTraceLogs } from '@/api';
import { formatDuration, formatTimestamp } from '@/utils/format';
import { status as statusColors } from '@/theme/tokens';

const { Text } = Typography;

function Metric({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span className="uppercase-label">{label}</span>
      <span className="num" style={{ fontSize: 18, fontWeight: 600, color: color || 'var(--heading)' }}>
        {value}
      </span>
    </div>
  );
}

export default function TraceDetailPage() {
  const { traceId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [selected, setSelected] = useState(null);

  const { data, loading, error, refetch } = useFetch(() => fetchTrace(traceId), [traceId]);
  const { data: logs } = useFetch(() => fetchTraceLogs(traceId), [traceId]);

  const traceStart = useMemo(
    () => (data?.spans?.length ? Math.min(...data.spans.map((s) => s.timestamp)) : 0),
    [data],
  );

  const summary = data?.summary;

  return (
    <>
      <PageHeader
        onBack={() => navigate(-1)}
        title={summary ? summary.rootName : t('traceDetail.trace')}
        description={summary ? <CopyableId value={summary.traceId} /> : t('traceDetail.loadingTrace')}
        tags={
          summary && (
            <Space size={6}>
              <SpanStatusTag value={summary.status} />
              <EnvTag value={summary.environment} />
            </Space>
          )
        }
      />

      <AsyncBoundary
        loading={loading && !data}
        error={error}
        onRetry={refetch}
        empty={!loading && !summary}
        emptyText={t('traceDetail.notFound')}
      >
        {summary && (
          <>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space size={40} wrap>
                <Metric label={t('traceDetail.mDuration')} value={formatDuration(summary.durationNs)} color="var(--brand-strong)" />
                <Metric label={t('traceDetail.mSpans')} value={summary.spanCount} />
                <Metric label={t('traceDetail.mServices')} value={summary.services.length} />
                <Metric
                  label={t('traceDetail.mErrors')}
                  value={summary.errorCount}
                  color={summary.errorCount ? statusColors.error : undefined}
                />
                <Metric label={t('traceDetail.mStart')} value={formatTimestamp(summary.startTime)} />
                <Metric label={t('traceDetail.mRootService')} value={<ServiceBadge name={summary.rootService} />} />
              </Space>
            </Card>

            <Card
              size="small"
              styles={{ body: { padding: 16 } }}
              title={
                <Space size={12} wrap>
                  <span>{t('traceDetail.spanTimeline')}</span>
                  <Space size={6} wrap>
                    {summary.services.map((s) => (
                      <ServiceBadge key={s} name={s} mono style={{ fontSize: 11 }} />
                    ))}
                  </Space>
                </Space>
              }
              extra={<Text type="secondary" style={{ fontSize: 12 }}>{t('traceDetail.clickSpanHint')}</Text>}
            >
              <Tabs
                defaultActiveKey="timeline"
                items={[
                  {
                    key: 'timeline',
                    label: t('traceDetail.tabTimeline'),
                    children: (
                      <TraceWaterfall
                        spans={data.spans}
                        selectedId={selected?.spanId}
                        onSelect={setSelected}
                      />
                    ),
                  },
                  {
                    key: 'logs',
                    label: (
                      <Space size={6}>
                        {t('traceDetail.tabRelatedLogs')}
                        <Badge
                          count={logs?.length || 0}
                          showZero
                          color="var(--brand-primary)"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        />
                      </Space>
                    ),
                    children: <RelatedLogs traceId={traceId} logs={logs} selectedSpan={selected} />,
                  },
                ]}
              />
            </Card>
          </>
        )}
      </AsyncBoundary>

      <SpanDetailDrawer
        span={selected}
        traceStart={traceStart}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
