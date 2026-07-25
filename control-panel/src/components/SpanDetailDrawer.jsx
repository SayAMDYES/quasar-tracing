/**
 * Side drawer showing the full detail of a selected span: identity, timing,
 * span/resource attributes and exception events. Reuses AttributeTable and the
 * shared tags so it stays consistent with the rest of the app.
 *
 * @author Quasar
 */
import { Drawer, Descriptions, Divider, Typography, Space, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import CopyableId from './CopyableId';
import AttributeTable from './AttributeTable';
import SpanInvestigationActions from './SpanInvestigationActions';
import { ServiceBadge, SpanStatusTag, SpanKindTag } from './tags';
import { formatDuration, formatTimestamp } from '@/utils/format';

const { Title } = Typography;

const DIAGNOSTIC_GROUPS = [
  {
    key: 'status',
    color: 'red',
    keys: [
      'span.status_code',
      'span.status_message',
      'status.code',
      'status.message',
      'error',
      'error.type',
      'exception.type',
      'exception.message',
    ],
    prefixes: ['exception.'],
  },
  {
    key: 'http',
    color: 'blue',
    keys: ['url.full', 'url.path', 'url.query', 'http.route', 'http.method', 'http.status_code'],
    prefixes: ['http.', 'url.'],
  },
  {
    key: 'db',
    color: 'purple',
    keys: ['db.system', 'db.name', 'db.operation', 'db.statement', 'db.query.text'],
    prefixes: ['db.'],
  },
  {
    key: 'rpc',
    color: 'geekblue',
    keys: ['rpc.system', 'rpc.service', 'rpc.method', 'rpc.grpc.status_code'],
    prefixes: ['rpc.'],
  },
  {
    key: 'messaging',
    color: 'cyan',
    keys: ['messaging.system', 'messaging.destination.name', 'messaging.operation.name'],
    prefixes: ['messaging.'],
  },
  {
    key: 'otel',
    color: 'green',
    keys: [
      'service.name',
      'service.namespace',
      'service.instance.id',
      'service.version',
      'deployment.environment.name',
      'telemetry.sdk.language',
      'telemetry.sdk.name',
    ],
    prefixes: ['service.', 'deployment.', 'telemetry.sdk.'],
  },
  {
    key: 'runtime',
    color: 'gold',
    keys: [
      'k8s.namespace.name',
      'k8s.pod.name',
      'k8s.node.name',
      'container.id',
      'container.name',
      'container.image.name',
      'container.image.tag',
    ],
    prefixes: ['k8s.', 'container.'],
  },
];

function addValue(target, key, value) {
  if (value != null && value !== '') {
    target[key] = value;
  }
}

function collectDiagnosticGroups(span) {
  if (!span) return [];

  const attributes = {
    ...(span.resourceAttributes || {}),
    ...(span.spanAttributes || {}),
  };

  addValue(attributes, 'span.name', span.name);
  addValue(attributes, 'span.kind', span.kind);
  addValue(attributes, 'span.status_code', span.statusCode);
  addValue(attributes, 'span.status_message', span.statusMessage);
  addValue(attributes, 'service.name', span.service);

  span.events?.forEach((event) => {
    if (event?.name?.toLowerCase().includes('exception')) {
      Object.entries(event.attributes || {}).forEach(([key, value]) => addValue(attributes, key, value));
    }
  });

  return DIAGNOSTIC_GROUPS.map((group) => {
    const matched = {};
    group.keys.forEach((key) => addValue(matched, key, attributes[key]));
    Object.entries(attributes).forEach(([key, value]) => {
      if (matched[key] != null) return;
      if (group.prefixes.some((prefix) => key.startsWith(prefix))) {
        addValue(matched, key, value);
      }
    });
    return { ...group, data: matched };
  }).filter((group) => Object.keys(group.data).length > 0);
}

export default function SpanDetailDrawer({
  span,
  traceStart,
  open,
  onClose,
  investigationActions,
  onInvestigationNavigate,
  onFilterResourceAttribute,
  onFilterSpanAttribute,
}) {
  const { t } = useTranslation();
  const diagnosticGroups = collectDiagnosticGroups(span);

  const items = span
    ? [
        ...(span.statusMessage
          ? [
              {
                key: 'msg',
                label: t('span.statusMessage'),
                children: <span style={{ color: 'var(--error)' }}>{span.statusMessage}</span>,
              },
            ]
          : []),
        {
          key: 'dur',
          label: t('span.duration'),
          children: (
            <span className="num" style={{ fontWeight: 600 }}>
              {formatDuration(span.durationNs)}
            </span>
          ),
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
        { key: 'span', label: t('span.spanId'), children: <CopyableId value={span.spanId} /> },
        {
          key: 'parent',
          label: t('span.parentId'),
          children: span.parentSpanId ? <CopyableId value={span.parentSpanId} /> : '—',
        },
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

          <SpanInvestigationActions
            actions={investigationActions}
            onNavigate={onInvestigationNavigate}
          />

          <Descriptions column={1} size="small" items={items} bordered />

          {diagnosticGroups.length > 0 && (
            <>
              <Divider orientation="left" plain style={{ marginTop: 22 }}>
                {t('span.diagnosticAttributes')}
              </Divider>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {diagnosticGroups.map((group) => (
                  <div key={group.key}>
                    <Tag color={group.color} style={{ marginBottom: 8 }}>
                      {t(`span.diagnosticGroups.${group.key}`)}
                    </Tag>
                    <AttributeTable data={group.data} />
                  </div>
                ))}
              </Space>
            </>
          )}

          <Divider orientation="left" plain style={{ marginTop: 22 }}>
            {t('span.spanAttributes')}
          </Divider>
          <AttributeTable
            data={span.spanAttributes}
            onFilterAttribute={onFilterSpanAttribute}
          />

          <Divider orientation="left" plain>
            {t('span.resourceAttributes')}
          </Divider>
          <AttributeTable
            data={span.resourceAttributes}
            onFilterAttribute={onFilterResourceAttribute}
          />

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
