/**
 * Trace Detail — span waterfall, a click-through span drawer, and the logs
 * correlated to this trace. Reconstructs the timeline from the flat span list.
 *
 * @author Quasar
 */
import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Button, Card, Tabs, Badge, Select, Space, Tag, Typography } from 'antd';
import { DiffOutlined, FlagOutlined } from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/PageHeader';
import AsyncBoundary from '@/components/AsyncBoundary';
import TraceWaterfall from '@/components/TraceWaterfall';
import SpanDetailDrawer from '@/components/SpanDetailDrawer';
import CopyableId from '@/components/CopyableId';
import TraceArchiveAction from '@/components/TraceArchiveAction';
import TraceSourceSelector from '@/components/TraceSourceSelector';
import { SpanStatusTag, EnvTag, ServiceBadge } from '@/components/tags';
import RelatedLogs from './RelatedLogs';
import TraceDiagnostics from './TraceDiagnostics';
import TraceStatistics from './TraceStatistics';
import TraceJsonPanel from './TraceJsonPanel';
import useTraceSource from '@/hooks/useTraceSource';
import useFetch from '@/hooks/useFetch';
import { fetchArchiveCapabilities } from '@/api';
import { useApp } from '@/context/AppContext';
import { formatDuration, formatTimestamp } from '@/utils/format';
import { createTraceAnalysis } from '@/utils/traceAnalysis';
import {
  buildInvestigationPath,
  spanInvestigationContext,
  traceInvestigationWindow,
} from '@/utils/investigationContext';
import { status as statusColors } from '@/theme/tokens';
import { useTraceCompareSelection } from '@/context/TraceCompareSelectionContext';
import { archiveTraceRef, importedTraceRef, liveTraceRef } from '@/utils/traceSourceRef';

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
  const { traceId: liveTraceId, sessionId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { message } = AntApp.useApp();
  const { range } = useApp();
  const compareSelection = useTraceCompareSelection();
  const [selected, setSelected] = useState(null);
  const [spanDrawerOpen, setSpanDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('timeline');
  const [jsonVisited, setJsonVisited] = useState(false);
  const requestedSource = searchParams.get('source') || 'auto';
  const { data: archiveCapabilities } = useFetch(fetchArchiveCapabilities, []);

  const traceSource = useTraceSource({
    liveTraceId,
    importedSessionId: sessionId,
    importedTraceId: searchParams.get('trace'),
    serverSource: requestedSource,
  });
  const {
    data,
    document: sourceDocument,
    error: currentError,
    loading,
    logs,
    refetch,
    session,
    source,
    traceId,
  } = traceSource;

  useEffect(() => {
    setSelected(null);
    setSpanDrawerOpen(false);
  }, [traceId]);

  const analysis = useMemo(() => createTraceAnalysis(data?.spans || []), [data?.spans]);
  const currentSelected = selected && analysis.byId.get(selected.spanId) === selected
    ? selected
    : null;
  const traceStart = analysis.traceStart;
  const traceLoading = loading && !data;
  const selectSpan = (span) => {
    setSelected(span);
    setSpanDrawerOpen(Boolean(span));
  };

  const summary = data?.summary;
  const sourceRef = source === 'imported'
    ? importedTraceRef(sessionId)
    : source === 'archive' ? archiveTraceRef(traceId) : liveTraceRef(traceId);
  const changeSource = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'auto') next.delete('source');
    else next.set('source', value);
    setSearchParams(next);
  };
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
        description={summary
          ? <CopyableId value={summary.traceId} />
          : currentError?.code === 'IMPORTED_SESSION_EXPIRED'
            ? t('traceImport.expired')
            : t('traceDetail.loadingTrace')}
        tags={
          summary && (
            <Space size={6}>
              <SpanStatusTag value={summary.status} />
              <EnvTag value={summary.environment} />
              {source === 'imported' && <Tag color="cyan">{t('traceImport.imported')}</Tag>}
              {source === 'archive' && <Tag color="purple">{t('traceArchive.sourceArchive')}</Tag>}
              {summary.archivedAt && <Tag>{t('traceArchive.archivedAt', { time: formatTimestamp(summary.archivedAt) })}</Tag>}
            </Space>
          )
        }
        extra={summary ? (
          <Space wrap>
            {source === 'imported' && session?.traceIds.length > 1 && (
              <Select
                className="imported-trace-selector"
                value={traceId}
                options={session.traceIds.map((value) => ({ label: value, value }))}
                onChange={(value) => {
                  const next = new URLSearchParams(searchParams);
                  next.set('trace', value);
                  setSearchParams(next);
                }}
              />
            )}
            {source !== 'imported' && (
              <TraceSourceSelector
                auto
                enabled={archiveCapabilities?.enabled}
                value={requestedSource}
                onChange={changeSource}
              />
            )}
            {source !== 'imported' && (
              <TraceArchiveAction
                traceId={traceId}
                archived={source === 'archive'}
                enabled={archiveCapabilities?.enabled}
                onArchived={() => refetch?.()}
                onDeleted={() => changeSource('live')}
              />
            )}
            <Button
              icon={<FlagOutlined />}
              onClick={() => {
                compareSelection.setBaseline(sourceRef);
                message.success(t('traceCompare.baselineSet'));
              }}
            >
              {t('traceCompare.setBaseline')}
            </Button>
            <Button
              type="primary"
              icon={<DiffOutlined />}
              onClick={() => {
                compareSelection.setBaseline(sourceRef);
                navigate('/traces');
              }}
            >
              {t('traceCompare.compareAnother')}
            </Button>
          </Space>
        ) : null}
      />

      <AsyncBoundary
        loading={traceLoading}
        error={currentError}
        onRetry={refetch}
        errorTitle={source === 'imported' ? t('traceImport.expiredTitle') : undefined}
        errorDescription={source === 'imported' ? t('traceImport.expired') : undefined}
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
                activeKey={activeTab}
                onChange={(key) => {
                  setActiveTab(key);
                  if (key === 'json') setJsonVisited(true);
                }}
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
                    key: 'json',
                    label: t('traceDetail.tabJson'),
                    children: jsonVisited ? (
                      <TraceJsonPanel
                        traceId={traceId}
                        source={source === 'archive' ? 'archive' : requestedSource}
                        traceDocument={sourceDocument}
                      />
                    ) : null,
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
