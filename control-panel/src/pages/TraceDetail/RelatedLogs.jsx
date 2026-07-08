/**
 * Logs correlated to the current trace by trace_id — the trace→logs join that
 * is the platform's core cross-cutting concern. Rendered inside the trace
 * detail "Related logs" tab.
 *
 * @author Quasar
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Segmented, Space, Table, Typography } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SeverityTag, ServiceBadge } from '@/components/tags';
import CopyableId from '@/components/CopyableId';
import { formatTime } from '@/utils/format';

const { Text } = Typography;

export default function RelatedLogs({ traceId, logs, selectedSpan }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [scope, setScope] = useState('trace');
  const selectedSpanId = selectedSpan?.spanId;
  const hasSpanIds = useMemo(() => (logs || []).some((log) => log.spanId), [logs]);

  useEffect(() => {
    setScope(selectedSpanId ? 'span' : 'trace');
  }, [selectedSpanId]);

  const scopeOptions = [
    { label: t('traceDetail.rlScopeTrace'), value: 'trace' },
    {
      label: t('traceDetail.rlScopeSpan'),
      value: 'span',
      disabled: !selectedSpanId,
    },
  ];
  const canFilterBySpan = scope === 'span' && selectedSpanId && hasSpanIds;
  const visibleLogs = useMemo(
    () => (canFilterBySpan ? (logs || []).filter((log) => log.spanId === selectedSpanId) : logs || []),
    [canFilterBySpan, logs, selectedSpanId],
  );

  const columns = [
    {
      title: t('traceDetail.rlTime'),
      dataIndex: 'timestamp',
      width: 126,
      render: (ts) => <span className="num muted">{formatTime(ts)}</span>,
    },
    { title: t('traceDetail.rlLevel'), dataIndex: 'severity', width: 80, render: (s) => <SeverityTag value={s} /> },
    {
      title: t('traceDetail.rlService'),
      dataIndex: 'service',
      width: 180,
      render: (s) => <ServiceBadge name={s} />,
    },
    {
      title: t('traceDetail.rlSpanId'),
      dataIndex: 'spanId',
      width: 130,
      render: (id) => (id ? <CopyableId value={id} short head={8} /> : <span className="muted">—</span>),
    },
    {
      title: t('traceDetail.rlMessage'),
      dataIndex: 'body',
      ellipsis: true,
      render: (b) => <span className="mono table-cell-strong">{b}</span>,
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <Space size={10} wrap>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {t('traceDetail.relatedCorrelated', { n: visibleLogs.length })}{' '}
            <span className="mono">{canFilterBySpan ? 'span_id' : 'trace_id'}</span>
          </Text>
          <Segmented size="small" options={scopeOptions} value={scope} onChange={setScope} />
        </Space>
        <Space size={8} wrap>
          {selectedSpanId && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('traceDetail.rlCurrentSpan')} <span className="mono">{selectedSpanId.slice(0, 12)}</span>
            </Text>
          )}
          <Button
            type="link"
            size="small"
            icon={<ExportOutlined />}
            onClick={() => {
              const query = new URLSearchParams({ traceId });
              if (scope === 'span' && selectedSpanId && hasSpanIds) {
                query.set('spanId', selectedSpanId);
              }
              navigate(`/logs?${query.toString()}`);
            }}
          >
            {t('traceDetail.openInLogSearch')}
          </Button>
        </Space>
      </div>
      {scope === 'span' && selectedSpanId && !hasSpanIds && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 10 }}
          message={t('traceDetail.rlSpanFilterUnavailable')}
        />
      )}
      <Table
        rowKey={(r) => r.id || `${r.timestamp}-${r.traceId}-${r.spanId}-${r.body}`}
        className="data-table"
        size="small"
        columns={columns}
        dataSource={visibleLogs}
        pagination={false}
        scroll={{ x: 900, y: 420 }}
      />
    </>
  );
}
