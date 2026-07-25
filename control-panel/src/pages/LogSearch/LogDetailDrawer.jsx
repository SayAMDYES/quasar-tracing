/**
 * Log record detail drawer: full body plus structured fields, with a jump link
 * to the owning trace (log→trace correlation).
 *
 * @author Quasar
 */
import { Drawer, Descriptions, Button, Space, Divider, Tooltip } from 'antd';
import { ApartmentOutlined, LineChartOutlined, PartitionOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CopyableId from '@/components/CopyableId';
import AttributeTable from '@/components/AttributeTable';
import { SeverityTag, ServiceBadge, EnvTag } from '@/components/tags';
import { useApp } from '@/context/AppContext';
import { formatTimestamp } from '@/utils/format';
import { buildInvestigationPath } from '@/utils/investigationContext';

function nonBlankText(value) {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

export default function LogDetailDrawer({ log, open, onClose }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { range } = useApp();

  const resourceAttributes = log?.resourceAttributes || {};
  const traceId = nonBlankText(log?.traceId);
  const service = nonBlankText(log?.service)
    || nonBlankText(resourceAttributes['service.name']);
  const serviceInstanceId = nonBlankText(log?.serviceInstanceId)
    || nonBlankText(resourceAttributes['service.instance.id']);
  const environment = nonBlankText(log?.environment)
    || nonBlankText(resourceAttributes['deployment.environment.name']);
  const namespace = nonBlankText(resourceAttributes['service.namespace'])
    || nonBlankText(resourceAttributes['k8s.namespace.name'])
    || nonBlankText(log?.k8sNamespace);
  const investigationContext = service ? {
    from: range.from,
    to: range.to,
    service,
    serviceInstanceId,
    environment,
    namespace,
  } : null;
  const metricsPath = investigationContext
    ? buildInvestigationPath('metrics', investigationContext)
    : null;
  const topologyPath = investigationContext
    ? buildInvestigationPath('services', investigationContext)
    : null;
  const serviceDisabledReason = service
    ? t('log.invalidTimeRange')
    : t('log.missingService');
  const openInvestigation = (path) => {
    if (path) navigate(path);
  };

  const attributes = log
    ? {
        ...(log.resourceAttributes || {}),
        'service.name': log.service,
        'log.severity': log.severity,
        'host.name': log.host,
        'deployment.environment.name': log.environment,
        'service.instance.id': log.serviceInstanceId,
        'k8s.namespace.name': log.k8sNamespace,
        'k8s.pod.name': log.k8sPodName,
        'k8s.pod.uid': log.k8sPodUid,
        'k8s.node.name': log.k8sNodeName,
        ...(log.spanId ? { 'span.id': log.spanId } : {}),
      }
    : {};

  return (
    <Drawer
      rootClassName="investigation-actions-drawer"
      open={open}
      onClose={onClose}
      width={560}
      title={t('log.title')}
      extra={
        log && (
          <Space size={6} wrap className="log-detail-investigation-actions">
            <Tooltip title={traceId ? null : t('log.missingTraceId')}>
              <span
                tabIndex={traceId ? undefined : 0}
                aria-label={traceId ? undefined : `${t('log.viewTrace')}: ${t('log.missingTraceId')}`}
              >
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<PartitionOutlined />}
                  disabled={!traceId}
                  onClick={() => {
                    if (traceId) navigate(`/traces/${traceId}`);
                  }}
                >
                  {t('log.viewTrace')}
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={metricsPath ? null : serviceDisabledReason}>
              <span
                tabIndex={metricsPath ? undefined : 0}
                aria-label={metricsPath ? undefined : `${t('log.viewMetrics')}: ${serviceDisabledReason}`}
              >
                <Button
                  size="small"
                  icon={<LineChartOutlined />}
                  disabled={!metricsPath}
                  onClick={() => openInvestigation(metricsPath)}
                >
                  {t('log.viewMetrics')}
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={topologyPath ? null : serviceDisabledReason}>
              <span
                tabIndex={topologyPath ? undefined : 0}
                aria-label={topologyPath ? undefined : `${t('log.locateTopology')}: ${serviceDisabledReason}`}
              >
                <Button
                  size="small"
                  icon={<ApartmentOutlined />}
                  disabled={!topologyPath}
                  onClick={() => openInvestigation(topologyPath)}
                >
                  {t('log.locateTopology')}
                </Button>
              </span>
            </Tooltip>
          </Space>
        )
      }
    >
      {log && (
        <>
          <Space size={8} style={{ marginBottom: 14 }}>
            <SeverityTag value={log.severity} />
            <ServiceBadge name={log.service} />
            <EnvTag value={log.environment} />
          </Space>

          <div
            className="mono"
            style={{
              background: '#0f141a',
              color: '#E6E8EB',
              padding: '12px 14px',
              borderRadius: 8,
              fontSize: 12.5,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              marginBottom: 18,
            }}
          >
            {log.body}
          </div>

          <Descriptions
            column={1}
            size="small"
            bordered
            items={[
              {
                key: 'trace',
                label: t('log.traceId'),
                children: log.traceId ? <CopyableId value={log.traceId} /> : <span className="muted">{t('log.notCorrelated')}</span>,
              },
              {
                key: 'span',
                label: t('log.spanId'),
                children: log.spanId ? <CopyableId value={log.spanId} /> : <span className="muted">—</span>,
              },
              {
                key: 'time',
                label: t('log.timestamp'),
                children: <span className="num">{formatTimestamp(log.timestamp)}</span>,
              },
            ]}
          />

          <Divider orientation="left" plain style={{ marginTop: 22 }}>
            {t('log.attributes')}
          </Divider>
          <AttributeTable data={attributes} />
        </>
      )}
    </Drawer>
  );
}
