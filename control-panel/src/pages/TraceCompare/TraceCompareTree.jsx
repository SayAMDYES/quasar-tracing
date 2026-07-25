/**
 * Virtualized merged structural-difference tree.
 *
 * @author Quasar
 */
import { useMemo, useState } from 'react';
import { Segmented, Space, Table, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { SpanStatusTag } from '@/components/tags';
import { formatDuration } from '@/utils/format';

const FILTERS = ['all', 'regressions', 'status', 'added', 'removed', 'content'];

function matchesFilter(row, filter) {
  if (filter === 'regressions') return row.change.regression;
  if (filter === 'status') return row.change.statusChanged;
  if (filter === 'added') return row.change.added;
  if (filter === 'removed') return row.change.removed;
  if (filter === 'content') return row.change.attributesChanged || row.change.eventsChanged;
  return true;
}

function signedDuration(value) {
  if (value == null) return '—';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${formatDuration(number)}`;
}

export default function TraceCompareTree({ rows, onSelect }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('all');
  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows;
    const visible = new Set();
    const byKey = new Map(rows.map((row) => [row.matchKey, row]));
    rows.filter((row) => matchesFilter(row, filter)).forEach((row) => {
      let current = row;
      while (current && !visible.has(current.matchKey)) {
        visible.add(current.matchKey);
        current = byKey.get(current.parentMatchKey);
      }
    });
    return rows.filter((row) => visible.has(row.matchKey));
  }, [filter, rows]);

  const columns = [
    {
      title: t('traceCompare.operationService'),
      key: 'operation',
      width: 360,
      render: (_, row) => (
        <div className="trace-compare-operation" style={{ paddingLeft: row.depth * 16 }}>
          <span className="trace-compare-tree-branch" />
          <span className="trace-compare-service">{row.signature.serviceName}</span>
          <span className="trace-compare-operation-name">{row.signature.name}</span>
        </div>
      ),
    },
    {
      title: t('traceCompare.status'),
      key: 'status',
      width: 180,
      render: (_, row) => (
        <Space size={4}>
          {row.status.a && <SpanStatusTag value={row.status.a.code} />}
          {row.change.statusChanged && <span>→</span>}
          {row.status.b && (row.change.statusChanged || !row.status.a) && <SpanStatusTag value={row.status.b.code} />}
        </Space>
      ),
    },
    {
      title: t('traceCompare.changes'),
      key: 'changes',
      width: 300,
      render: (_, row) => (
        <Space size={[4, 4]} wrap>
          {row.change.added && <Tag color="green">{t('traceCompare.added')}</Tag>}
          {row.change.removed && <Tag color="red">{t('traceCompare.removed')}</Tag>}
          {row.change.regression && <Tag color="volcano">{t('traceCompare.regression')}</Tag>}
          {row.change.statusChanged && <Tag color="gold">{t('traceCompare.statusChanged')}</Tag>}
          {row.change.attributesChanged && <Tag color="blue">{t('traceCompare.attributesChanged')}</Tag>}
          {row.change.eventsChanged && <Tag color="purple">{t('traceCompare.eventsChanged')}</Tag>}
          {row.change.criticalPathChanged && <Tag>{t('traceCompare.criticalChanged')}</Tag>}
        </Space>
      ),
    },
    {
      title: 'Delta',
      key: 'delta',
      width: 130,
      render: (_, row) => (
        <span className={row.change.regression ? 'trace-compare-regression' : 'num'}>
          {signedDuration(row.duration.deltaNano)}
        </span>
      ),
    },
    {
      title: 'A',
      key: 'aDuration',
      width: 120,
      render: (_, row) => row.duration.aNano == null ? '—' : formatDuration(Number(row.duration.aNano)),
    },
    {
      title: 'B',
      key: 'bDuration',
      width: 120,
      render: (_, row) => row.duration.bNano == null ? '—' : formatDuration(Number(row.duration.bNano)),
    },
  ];

  return (
    <div className="trace-compare-tree">
      <Segmented
        className="trace-compare-filters"
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((value) => ({ value, label: t(`traceCompare.filter.${value}`) }))}
      />
      <Table
        virtual
        rowKey="matchKey"
        size="small"
        columns={columns}
        dataSource={filteredRows}
        pagination={false}
        scroll={{ x: 1210, y: 620 }}
        onRow={(row) => ({
          onClick: () => onSelect(row),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(row);
            }
          },
          tabIndex: 0,
          role: 'button',
        })}
      />
    </div>
  );
}
