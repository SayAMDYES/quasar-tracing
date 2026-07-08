/**
 * Service Map — force-directed dependency graph derived from span parent/child
 * relationships. Node size = traffic, red ring/edge = elevated error rate.
 * Clicking a node opens the service detail panel.
 *
 * @author Quasar
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Space, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/PageHeader';
import EChart from '@/components/EChart';
import AsyncBoundary from '@/components/AsyncBoundary';
import ServicePanel from './ServicePanel';
import { useApp } from '@/context/AppContext';
import useFetch from '@/hooks/useFetch';
import { fetchDependencies } from '@/api';
import { buildServiceGraph } from '@/charts/options';

const { Text } = Typography;

export default function ServiceMapPage() {
  const { range, autoRefreshRevision } = useApp();
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState(searchParams.get('focus') || null);

  const { data, loading, error, refetch } = useFetch(
    () => fetchDependencies({ from: range.from, to: range.to }),
    [range.from, range.to],
    { backgroundKey: autoRefreshRevision },
  );

  // Honor ?focus=service deep links (e.g. from the Overview health table).
  useEffect(() => {
    const focus = searchParams.get('focus');
    if (focus) setSelected(focus);
  }, [searchParams]);

  const option = useMemo(
    () => (data ? buildServiceGraph(data.nodes, data.edges, selected) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, selected, i18n.language],
  );

  const onEvents = useMemo(
    () => ({
      click: (params) => {
        if (params.dataType === 'node') setSelected(params.data.name);
      },
    }),
    [],
  );

  const closePanel = () => {
    setSelected(null);
    if (searchParams.get('focus')) setSearchParams({});
  };

  return (
    <>
      <PageHeader
        title={t('serviceMap.title')}
        description={t('serviceMap.description')}
        extra={<Text type="secondary" style={{ fontSize: 12 }}>{t('serviceMap.hint')}</Text>}
      />

      <Card size="small" styles={{ body: { padding: 8 } }}>
        <AsyncBoundary
          loading={loading && !data}
          error={error}
          onRetry={refetch}
          empty={data && data.nodes.length === 0}
          skeleton={<div style={{ height: 560 }} />}
        >
          {option && (
            <EChart option={option} onEvents={onEvents} height={580} notMerge={false} />
          )}
        </AsyncBoundary>
      </Card>

      <Space style={{ marginTop: 12 }} wrap>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {data ? t('serviceMap.count', { services: data.nodes.length, edges: data.edges.length }) : ''}
        </Text>
      </Space>

      <ServicePanel
        name={selected}
        range={range}
        autoRefreshRevision={autoRefreshRevision}
        open={!!selected}
        onClose={closePanel}
        onSelectService={setSelected}
      />
    </>
  );
}
