/**
 * Service and operation aggregates derived from the current trace.
 *
 * @author Quasar
 */
import { useMemo } from 'react';
import { Table, Tabs } from 'antd';
import { useTranslation } from 'react-i18next';
import { ServiceBadge } from '@/components/tags';
import { formatDuration } from '@/utils/format';

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

function LongValue({ value }) {
  const text = value || '—';
  return (
    <span className="trace-table-long-value mono" title={text}>
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

export default function TraceStatistics({ analysis, onSelectSpan }) {
  const { t } = useTranslation();
  const services = useMemo(
    () => [...(analysis?.serviceStats || [])].sort(
      (left, right) => right.selfDurationMs - left.selfDurationMs
        || String(left.service).localeCompare(String(right.service)),
    ),
    [analysis],
  );
  const operations = useMemo(
    () => [...(analysis?.operationStats || [])].sort(
      (left, right) => right.totalDurationMs - left.totalDurationMs
        || String(left.service).localeCompare(String(right.service))
        || String(left.operation).localeCompare(String(right.operation)),
    ),
    [analysis],
  );

  const metricColumns = [
    {
      title: t('traceDetail.mSpans'),
      dataIndex: 'spanCount',
      width: 88,
      align: 'right',
      render: (count) => <span className="num">{count}</span>,
    },
    {
      title: t('traceDetail.mErrors'),
      dataIndex: 'errorCount',
      width: 88,
      align: 'right',
      render: (count) => (
        <span className="num" style={{ color: count ? 'var(--error)' : 'var(--text-muted)' }}>
          {count}
        </span>
      ),
    },
    {
      title: t('traceSearch.colDuration'),
      dataIndex: 'totalDurationMs',
      width: 130,
      align: 'right',
      render: (durationMs) => <span className="num">{formatDuration(durationMs * 1e6)}</span>,
    },
    {
      title: t('traceDetail.selfDuration'),
      dataIndex: 'selfDurationMs',
      width: 130,
      align: 'right',
      render: (durationMs) => <span className="num">{formatDuration(durationMs * 1e6)}</span>,
    },
    {
      title: t('traceDetail.criticalDuration'),
      dataIndex: 'criticalDurationMs',
      width: 150,
      align: 'right',
      render: (durationMs) => <span className="num">{formatDuration(durationMs * 1e6)}</span>,
    },
    {
      title: t('traceDetail.criticalSpanCount'),
      dataIndex: 'criticalSpanCount',
      width: 116,
      align: 'right',
      render: (count) => <span className="num">{count}</span>,
    },
  ];

  const serviceColumns = [
    {
      title: t('traceSearch.service'),
      dataIndex: 'service',
      width: 220,
      render: (service) => <ServiceCell service={service} />,
    },
    ...metricColumns,
  ];

  const operationColumns = [
    {
      title: t('traceSearch.colOperation'),
      dataIndex: 'operation',
      width: 340,
      ellipsis: true,
      render: (operation) => <LongValue value={operation} />,
    },
    {
      title: t('traceSearch.service'),
      dataIndex: 'service',
      width: 220,
      render: (service) => <ServiceCell service={service} />,
    },
    ...metricColumns,
  ];

  const tableProps = {
    className: 'data-table trace-interactive-table',
    size: 'small',
    pagination: { pageSize: 20, showSizeChanger: false, hideOnSinglePage: true },
    locale: { emptyText: t('common.noData') },
  };

  return (
    <div className="trace-statistics">
      <Tabs
        defaultActiveKey="service"
        items={[
          {
            key: 'service',
            label: t('traceDetail.serviceStatistics'),
            children: (
              <Table
                {...tableProps}
                rowKey={(record) => record.service || '__empty_service__'}
                columns={serviceColumns}
                dataSource={services}
                scroll={{ x: 832 }}
                onRow={(record) => interactiveRowProps(record.representativeSpan, onSelectSpan)}
              />
            ),
          },
          {
            key: 'operation',
            label: t('traceDetail.operationStatistics'),
            children: (
              <Table
                {...tableProps}
                rowKey={(record) => JSON.stringify([record.service, record.operation])}
                columns={operationColumns}
                dataSource={operations}
                scroll={{ x: 1172 }}
                onRow={(record) => interactiveRowProps(record.representativeSpan, onSelectSpan)}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
