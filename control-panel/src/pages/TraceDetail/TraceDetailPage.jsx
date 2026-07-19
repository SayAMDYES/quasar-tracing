/**
 * Trace Detail — span waterfall, a click-through span drawer, and the logs
 * correlated to this trace. Reconstructs the timeline from the flat span list.
 *
 * @author Quasar
 */
import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Card, Tabs, Badge, Space, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/PageHeader';
import AsyncBoundary from '@/components/AsyncBoundary';
import TraceWaterfall from '@/components/TraceWaterfall';
import SpanDetailDrawer from '@/components/SpanDetailDrawer';
import CopyableId from '@/components/CopyableId';
import { SpanStatusTag, EnvTag, ServiceBadge } from '@/components/tags';
import RelatedLogs from './RelatedLogs';
import TraceDiagnostics from './TraceDiagnostics';
import TraceStatistics from './TraceStatistics';
import useFetch from '@/hooks/useFetch';
import { fetchTrace, fetchTraceLogs } from '@/api';
import { useApp } from '@/context/AppContext';
import { formatDuration, formatTimestamp } from '@/utils/format';
import { createTraceAnalysis } from '@/utils/traceAnalysis';
import {
  buildInvestigationPath,
  spanInvestigationContext,
  traceInvestigationWindow,
} from '@/utils/investigationContext';
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
  const { message } = AntApp.useApp();
  const { range } = useApp();
  const [selected, setSelected] = useState(null);
  const [spanDrawerOpen, setSpanDrawerOpen] = useState(false);

  const {
    data: traceResult,
    loading,
    error,
    refetch,
  } = useFetch(
    () => fetchTrace(traceId)
      .then((value) => ({ traceId, value }))
      .catch((cause) => {
        throw Object.assign(
          new Error(cause?.message || 'Trace request failed', { cause }),
          { traceId },
        );
      }),
    [traceId],
  );
  const { data: logsResult } = useFetch(
    () => fetchTraceLogs(traceId).then((value) => ({ traceId, value })),
    [traceId],
  );

  useEffect(() => {
    setSelected(null);
    setSpanDrawerOpen(false);
  }, [traceId]);

  const hasCurrentTraceResult = traceResult?.traceId === traceId;
  const data = hasCurrentTraceResult ? traceResult.value : null;
  const logs = logsResult?.traceId === traceId ? logsResult.value : [];
  const currentError = error?.traceId === traceId ? error : null;
  const analysis = useMemo(() => createTraceAnalysis(data?.spans || []), [data?.spans]);
  const currentSelected = selected && analysis.byId.get(selected.spanId) === selected
    ? selected
    : null;
  const traceStart = analysis.traceStart;
  const traceLoading = (!hasCurrentTraceResult && !currentError) || (loading && !data);
  const selectSpan = (span) => {
    setSelected(span);
    setSpanDrawerOpen(Boolean(span));
  };

  const summary = data?.summary;
  const investigationWindow = useMemo(
    () => traceInvestigationWindow(summary) || { from: range.from, to: range.to },
    [summary, range.from, range.to],
  );
  const onFilterResourceAttribute = (key, value) => {
    const path = buildInvestigationPath('traces', {
      from: investigationWindow.from,
      to: investigationWindow.to,
      attributeConditions: [{ scope: 'resource', key, operator: 'equals', value }],
    });
    if (path) {
      navigate(path);
    } else {
      message.warning(t('span.attributeFilterUnsupported'));
    }
  };
  const onFilterSpanAttribute = (key, value) => {
    const path = buildInvestigationPath('traces', {
      from: investigationWindow.from,
      to: investigationWindow.to,
      attributeConditions: [{ scope: 'span', key, operator: 'equals', value }],
    });
    if (path) {
      navigate(path);
    } else {
      message.warning(t('span.attributeFilterUnsupported'));
    }
  };
  const investigationActions = useMemo(() => {
    const derivedContext = spanInvestigationContext(currentSelected, summary);
    if (!derivedContext) return null;

    const context = derivedContext.from !== undefined && derivedContext.to !== undefined
      ? derivedContext
      : { ...derivedContext, from: range.from, to: range.to };
    const hasRange = Boolean(buildInvestigationPath('traces', {
      from: context.from,
      to: context.to,
    }));
    const disabledReason = (missingReason) => (
      hasRange ? missingReason : t('span.investigation.invalidTimeRange')
    );
    const withRequirements = (destination, requirementsMet, missingReason, targetContext = context) => ({
      path: hasRange && requirementsMet ? buildInvestigationPath(destination, targetContext) : null,
      disabledReason: hasRange && requirementsMet ? null : disabledReason(missingReason),
    });

    return {
      logs: withRequirements(
        'logs',
        Boolean(context.traceId && context.spanId),
        t('span.investigation.missingLogContext'),
        {
          from: context.from,
          to: context.to,
          traceId: context.traceId,
          spanId: context.spanId,
          service: context.service,
        },
      ),
      metrics: withRequirements(
        'metrics',
        Boolean(context.service),
        t('span.investigation.missingService'),
      ),
      topology: withRequirements(
        'services',
        Boolean(context.service),
        t('span.investigation.missingService'),
      ),
      similarTraces: withRequirements(
        'traces',
        Boolean(context.service && context.operation),
        context.service
          ? t('span.investigation.missingOperation')
          : t('span.investigation.missingService'),
      ),
    };
  }, [currentSelected, summary, range.from, range.to, t]);

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
        loading={traceLoading}
        error={currentError}
        onRetry={refetch}
        empty={!traceLoading && !summary}
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
                        key={traceId}
                        spans={data.spans}
                        analysis={analysis}
                        selectedId={currentSelected?.spanId}
                        onSelect={selectSpan}
                      />
                    ),
                  },
                  {
                    key: 'diagnostics',
                    label: t('traceDetail.tabDiagnostics'),
                    children: <TraceDiagnostics analysis={analysis} onSelectSpan={selectSpan} />,
                  },
                  {
                    key: 'statistics',
                    label: t('traceDetail.tabStatistics'),
                    children: <TraceStatistics analysis={analysis} onSelectSpan={selectSpan} />,
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
                    children: (
                      <RelatedLogs
                        traceId={traceId}
                        logs={logs}
                        selectedSpan={currentSelected}
                        investigationWindow={investigationWindow}
                      />
                    ),
                  },
                ]}
              />
            </Card>
          </>
        )}
      </AsyncBoundary>

      <SpanDetailDrawer
        span={currentSelected}
        traceStart={traceStart}
        open={Boolean(spanDrawerOpen && currentSelected)}
        onClose={() => setSpanDrawerOpen(false)}
        investigationActions={investigationActions}
        onInvestigationNavigate={navigate}
        onFilterResourceAttribute={onFilterResourceAttribute}
        onFilterSpanAttribute={onFilterSpanAttribute}
      />
    </>
  );
}
