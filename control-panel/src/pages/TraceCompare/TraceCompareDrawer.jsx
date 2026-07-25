/**
 * Side-by-side Span and content diffs for a merged Compare row.
 *
 * @author Quasar
 */
import { Descriptions, Drawer, Empty, Table, Tabs, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '@/utils/format';

function SpanSide({ label, span }) {
  const { t } = useTranslation();
  if (!span) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('traceCompare.notPresent')} />;
  return (
    <div className="trace-compare-span-side">
      <h3>{label}</h3>
      <Descriptions
        bordered
        size="small"
        column={1}
        items={[
          { key: 'service', label: t('traceCompare.service'), children: span.serviceName },
          { key: 'operation', label: t('traceCompare.operation'), children: span.name },
          { key: 'status', label: t('traceCompare.status'), children: `${span.status.code}${span.status.message ? ` · ${span.status.message}` : ''}` },
          { key: 'duration', label: t('traceCompare.duration'), children: formatDuration(span.durationNano) },
          { key: 'kind', label: t('traceCompare.kind'), children: span.kind },
        ]}
      />
    </div>
  );
}

function attributeRows(diff) {
  return [
    ...diff.added.map((item) => ({ key: item.key, a: '', b: item.value, change: 'added' })),
    ...diff.removed.map((item) => ({ key: item.key, a: item.value, b: '', change: 'removed' })),
    ...diff.changed.map((item) => ({ key: item.key, a: item.before, b: item.after, change: 'changed' })),
  ];
}

function AttributeDiff({ diff }) {
  const { t } = useTranslation();
  const rows = attributeRows(diff);
  return rows.length ? (
    <Table
      rowKey={(row) => `${row.change}:${row.key}`}
      size="small"
      pagination={false}
      dataSource={rows}
      columns={[
        { title: t('traceCompare.key'), dataIndex: 'key', width: 220, render: (value) => <span className="mono">{value}</span> },
        { title: 'A', dataIndex: 'a', ellipsis: true },
        { title: 'B', dataIndex: 'b', ellipsis: true },
        { title: t('traceCompare.change'), dataIndex: 'change', width: 100, render: (value) => <Tag>{t(`traceCompare.${value}`)}</Tag> },
      ]}
      scroll={{ x: 760 }}
    />
  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
}

export default function TraceCompareDrawer({ row, open, onClose }) {
  const { t } = useTranslation();
  if (!row) return null;
  const eventRows = [
    ...row.eventDiff.added.map((event, index) => ({ ...event, key: `a-${index}`, change: 'added' })),
    ...row.eventDiff.removed.map((event, index) => ({ ...event, key: `r-${index}`, change: 'removed' })),
  ];
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={960}
      title={`${row.signature.serviceName} / ${row.signature.name}`}
    >
      <div className="trace-compare-span-grid">
        <SpanSide label="A · Baseline" span={row.a} />
        <SpanSide label="B · Candidate" span={row.b} />
      </div>
      <Tabs
        className="trace-compare-diff-tabs"
        items={[
          {
            key: 'resource',
            label: t('traceCompare.resourceAttributes'),
            children: <AttributeDiff diff={row.attributeDiff.resource} />,
          },
          {
            key: 'span',
            label: t('traceCompare.spanAttributes'),
            children: <AttributeDiff diff={row.attributeDiff.span} />,
          },
          {
            key: 'events',
            label: t('traceCompare.events'),
            children: eventRows.length ? (
              <Table
                rowKey="key"
                size="small"
                pagination={false}
                dataSource={eventRows}
                columns={[
                  { title: t('traceCompare.event'), dataIndex: 'name' },
                  { title: t('traceCompare.count'), dataIndex: 'count', width: 90 },
                  { title: t('traceCompare.change'), dataIndex: 'change', width: 110, render: (value) => <Tag>{t(`traceCompare.${value}`)}</Tag> },
                  { title: t('traceCompare.attributes'), dataIndex: 'attributes', render: (value) => <span className="mono">{JSON.stringify(value)}</span> },
                ]}
                scroll={{ x: 760 }}
              />
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />,
          },
        ]}
      />
    </Drawer>
  );
}
