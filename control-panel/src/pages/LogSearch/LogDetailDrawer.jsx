/**
 * Log record detail drawer: full body plus structured fields, with a jump link
 * to the owning trace (log→trace correlation).
 *
 * @author Quasar
 */
import { Drawer, Descriptions, Button, Space, Divider } from 'antd';
import { PartitionOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CopyableId from '@/components/CopyableId';
import AttributeTable from '@/components/AttributeTable';
import { SeverityTag, ServiceBadge, EnvTag } from '@/components/tags';
import { formatTimestamp } from '@/utils/format';

export default function LogDetailDrawer({ log, open, onClose }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

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
      open={open}
      onClose={onClose}
      width={560}
      title={t('log.title')}
      extra={
        log?.traceId && (
          <Button
            type="primary"
            ghost
            icon={<PartitionOutlined />}
            onClick={() => navigate(`/traces/${log.traceId}`)}
          >
            {t('log.viewTrace')}
          </Button>
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
                key: 'time',
                label: t('log.timestamp'),
                children: <span className="num">{formatTimestamp(log.timestamp)}</span>,
              },
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
