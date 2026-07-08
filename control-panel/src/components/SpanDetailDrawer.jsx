/**
 * Side drawer showing the full detail of a selected span: identity, timing,
 * span/resource attributes and exception events. Reuses AttributeTable and the
 * shared tags so it stays consistent with the rest of the app.
 *
 * @author Quasar
 */
import { Drawer, Descriptions, Divider, Typography, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import CopyableId from './CopyableId';
import AttributeTable from './AttributeTable';
import { ServiceBadge, SpanStatusTag, SpanKindTag } from './tags';
import { formatDuration, formatTimestamp } from '@/utils/format';

const { Title } = Typography;

export default function SpanDetailDrawer({ span, traceStart, open, onClose }) {
  const { t } = useTranslation();

  const items = span
    ? [
        { key: 'span', label: t('span.spanId'), children: <CopyableId value={span.spanId} /> },
        {
          key: 'parent',
          label: t('span.parentId'),
          children: span.parentSpanId ? <CopyableId value={span.parentSpanId} /> : '—',
        },
        {
          key: 'start',
          label: t('span.startTime'),
          children: <span className="num">{formatTimestamp(span.timestamp)}</span>,
        },
        {
          key: 'rel',
          label: t('span.offset'),
          children: (
            <span className="num">+{formatDuration((span.timestamp - traceStart) * 1e6)}</span>
          ),
        },
        {
          key: 'dur',
          label: t('span.duration'),
          children: (
            <span className="num" style={{ fontWeight: 600 }}>
              {formatDuration(span.durationNs)}
            </span>
          ),
        },
        ...(span.statusMessage
          ? [
              {
                key: 'msg',
                label: t('span.statusMessage'),
                children: <span style={{ color: 'var(--error)' }}>{span.statusMessage}</span>,
              },
            ]
          : []),
      ]
    : [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={560}
      title={t('span.title')}
      styles={{ body: { paddingTop: 16 } }}
    >
      {span && (
        <>
          <Title level={5} className="mono" style={{ marginTop: 0, marginBottom: 10 }}>
            {span.name}
          </Title>
          <Space wrap size={8} style={{ marginBottom: 16 }}>
            <ServiceBadge name={span.service} />
            <SpanKindTag value={span.kind} />
            <SpanStatusTag value={span.statusCode} />
          </Space>

          <Descriptions column={1} size="small" items={items} bordered />

          <Divider orientation="left" plain style={{ marginTop: 22 }}>
            {t('span.spanAttributes')}
          </Divider>
          <AttributeTable data={span.spanAttributes} />

          <Divider orientation="left" plain>
            {t('span.resourceAttributes')}
          </Divider>
          <AttributeTable data={span.resourceAttributes} />

          {span.events && span.events.length > 0 && (
            <>
              <Divider orientation="left" plain>
                {t('span.events')}
              </Divider>
              {span.events.map((evt, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <Space size={8} style={{ marginBottom: 6 }}>
                    <SpanStatusTag value="Error" />
                    <b className="mono">{evt.name}</b>
                    <span className="muted num" style={{ fontSize: 12 }}>
                      {formatTimestamp(evt.timestamp)}
                    </span>
                  </Space>
                  <AttributeTable data={evt.attributes} />
                </div>
              ))}
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
