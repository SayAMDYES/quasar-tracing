/**
 * Logs correlated to the current trace by trace_id — the trace→logs join that
 * is the platform's core cross-cutting concern. Rendered inside the trace
 * detail "Related logs" tab.
 *
 * @author Quasar
 */
import { Table, Space, Typography, Button } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SeverityTag, ServiceBadge } from '@/components/tags';
import CopyableId from '@/components/CopyableId';
import { formatTime } from '@/utils/format';

const { Text } = Typography;

export default function RelatedLogs({ traceId, logs }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

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
        <Text type="secondary" style={{ fontSize: 13 }}>
          {t('traceDetail.relatedCorrelated', { n: logs?.length || 0 })}{' '}
          <span className="mono">trace_id</span>
        </Text>
        <Button
          type="link"
          size="small"
          icon={<ExportOutlined />}
          onClick={() => navigate(`/logs?traceId=${traceId}`)}
        >
          {t('traceDetail.openInLogSearch')}
        </Button>
      </div>
      <Table
        rowKey={(r, i) => `${r.spanId}-${i}`}
        className="data-table"
        size="small"
        columns={columns}
        dataSource={logs || []}
        pagination={false}
        scroll={{ x: 900, y: 420 }}
      />
    </>
  );
}
