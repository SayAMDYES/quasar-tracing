/**
 * Derived trace diagnostics for critical-path, latency, and error inspection.
 *
 * @author Quasar
 */
import { Table, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { ServiceBadge, SpanStatusTag } from '@/components/tags';
import { formatDuration, formatPercent } from '@/utils/format';

function spanDurationMs(span) {
  const durationMs = Number(span?.durationMs);
  if (Number.isFinite(durationMs)) return Math.max(0, durationMs);
  const durationNs = Number(span?.durationNs);
  return Number.isFinite(durationNs) ? Math.max(0, durationNs / 1e6) : 0;
}

function isNestedInteractiveTarget(event) {
  const interactive = event.target?.closest?.(
    'a, button, input, select, textarea, [role="button"], [role="link"], [tabindex], [contenteditable="true"]',
  );
  return Boolean(interactive && interactive !== event.currentTarget);
}

function interactiveRowProps(span, onSelectSpan) {
  const activate = (event) => {
    if (isNestedInteractiveTarget(event)) return;
    onSelectSpan?.(span);
  };

  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': `${span?.name || ''} ${span?.service || ''}`.trim(),
    onClick: activate,
    onKeyDown: (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (isNestedInteractiveTarget(event)) return;
      event.preventDefault();
      onSelectSpan?.(span);
    },
  };
}

function LongValue({ value, mono = false }) {
  const text = value || '—';
  return (
    <span className={`trace-table-long-value${mono ? ' mono' : ''}`} title={text}>
      {text}
    </span>
  );
}

function ServiceCell({ service }) {
  if (!service) return <span className="muted">—</span>;
  return (
    <span className="trace-table-long-value" title={service}>
      <ServiceBadge name={service} />
    </span>
  );
}

export default function TraceDiagnostics({ analysis, onSelectSpan }) {
  const { t } = useTranslation();
  const criticalSections = analysis?.criticalSections || [];
  const slowSpans = analysis?.slowSpans || [];
  const errorSpans = analysis?.errorSpans || [];
  const criticalSpanIds = analysis?.criticalSpanIds || new Set();
  const criticalDurationMs = criticalSections.reduce(
    (total, section) => total + section.durationMs,
    0,
  );
  const criticalShare = analysis?.durationMs > 0
    ? Math.min(1, criticalDurationMs / analysis.durationMs)
    : 0;
  const slowest = slowSpans[0];
  const bottleneck = (analysis?.serviceStats || []).reduce(
    (greatest, service) => (
      !greatest || service.selfDurationMs > greatest.selfDurationMs ? service : greatest
    ),
    null,
  );

  const slowColumns = [
    {
      title: t('traceSearch.service'),
      key: 'service',
      width: 180,
      render: (_, record) => <ServiceCell service={record.span.service} />,
    },
    {
      title: t('traceSearch.colOperation'),
      key: 'operation',
      width: 280,
      ellipsis: true,
      render: (_, record) => <LongValue value={record.span.name} mono />,
    },
    {
      title: t('traceDetail.criticalPath'),
      key: 'critical',
      width: 112,
      align: 'center',
      render: (_, record) => (
        criticalSpanIds.has(record.span.spanId)
          ? <Tag color="warning">{t('traceDetail.criticalPath')}</Tag>
          : <span className="muted">—</span>
      ),
    },
    {
      title: t('traceDetail.selfDuration'),
      dataIndex: 'selfDurationMs',
      width: 126,
      align: 'right',
      render: (durationMs) => <span className="num">{formatDuration(durationMs * 1e6)}</span>,
    },
    {
      title: t('traceSearch.colDuration'),
      key: 'duration',
      width: 126,
      align: 'right',
      render: (_, record) => (
        <span className="num">{formatDuration(spanDurationMs(record.span) * 1e6)}</span>
      ),
    },
  ];

  const errorColumns = [
    {
      title: t('traceSearch.service'),
      key: 'service',
      width: 180,
      render: (_, record) => <ServiceCell service={record.span.service} />,
    },
    {
      title: t('traceSearch.colOperation'),
      key: 'operation',
      width: 260,
      ellipsis: true,
      render: (_, record) => <LongValue value={record.span.name} mono />,
    },
    {
      title: t('traceSearch.colStatus'),
      key: 'status',
      width: 104,
      render: (_, record) => <SpanStatusTag value={record.span.statusCode} />,
    },
    {
      title: t('traceSearch.colDuration'),
      key: 'duration',
      width: 126,
      align: 'right',
      render: (_, record) => (
        <span className="num">{formatDuration(spanDurationMs(record.span) * 1e6)}</span>
      ),
    },
    {
      title: t('traceDetail.spanPath'),
      dataIndex: 'path',
      width: 360,
      ellipsis: true,
      render: (path) => <LongValue value={(path || []).join(' / ')} />,
    },
  ];

  return (
    <div className="trace-diagnostics">
      <div className="trace-diagnostic-summary">
        <div className="trace-diagnostic-summary-item">
          <span className="trace-diagnostic-summary-label">{t('traceDetail.criticalShare')}</span>
          <span className="trace-diagnostic-summary-value num">
            {formatPercent(criticalShare, 1)}
          </span>
        </div>
        <div className="trace-diagnostic-summary-item">
          <span className="trace-diagnostic-summary-label">{t('traceDetail.errorSpans')}</span>
          <span className="trace-diagnostic-summary-value num">{errorSpans.length}</span>
        </div>
        <div className="trace-diagnostic-summary-item">
          <span className="trace-diagnostic-summary-label">{t('traceDetail.slowestSpan')}</span>
          <span className="trace-diagnostic-summary-value mono" title={slowest?.span?.name}>
            {slowest?.span?.name || '—'}
          </span>
          {slowest && (
            <span className="trace-diagnostic-summary-meta num">
              {formatDuration(slowest.selfDurationMs * 1e6)}
            </span>
          )}
        </div>
        <div className="trace-diagnostic-summary-item">
          <span className="trace-diagnostic-summary-label">{t('traceDetail.bottleneckService')}</span>
          <span className="trace-diagnostic-summary-value">
            <ServiceCell service={bottleneck?.service} />
          </span>
          {bottleneck && (
            <span className="trace-diagnostic-summary-meta num">
              {formatDuration(bottleneck.selfDurationMs * 1e6)}
            </span>
          )}
        </div>
      </div>

      <section className="trace-table-section">
        <h3 className="trace-section-heading">{t('traceDetail.slowSpanTitle')}</h3>
        <Table
          rowKey={(record) => record.span.spanId}
          className="data-table trace-interactive-table"
          size="small"
          columns={slowColumns}
          dataSource={slowSpans}
          pagination={false}
          locale={{ emptyText: t('common.noData') }}
          scroll={{ x: 824 }}
          onRow={(record) => interactiveRowProps(record.span, onSelectSpan)}
        />
      </section>

      <section className="trace-table-section">
        <h3 className="trace-section-heading">{t('traceDetail.errorPathTitle')}</h3>
        <Table
          rowKey={(record) => record.span.spanId}
          className="data-table trace-interactive-table"
          size="small"
          columns={errorColumns}
          dataSource={errorSpans}
          pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
          locale={{ emptyText: t('common.noData') }}
          scroll={{ x: 1030 }}
          onRow={(record) => interactiveRowProps(record.span, onSelectSpan)}
        />
      </section>
    </div>
  );
}
