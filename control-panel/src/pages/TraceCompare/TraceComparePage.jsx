/**
 * Trace Compare page backed by two v1 Documents and the shared Trace Worker.
 *
 * @author Quasar
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import { ExportOutlined, SwapOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/PageHeader';
import AsyncBoundary from '@/components/AsyncBoundary';
import { fetchTraceDocument } from '@/api';
import { createTraceWorkerClient } from '@/workers/traceWorkerClient';
import {
  parseTraceSourceRef,
  traceRefPath,
} from '@/utils/traceSourceRef';
import TraceCompareSummary from './TraceCompareSummary';
import TraceCompareTree from './TraceCompareTree';
import TraceCompareDrawer from './TraceCompareDrawer';

const { Text } = Typography;

function compareError(code) {
  return Object.assign(new Error(code), { code });
}

export default function TraceComparePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const workerRef = useRef(null);
  if (!workerRef.current) workerRef.current = createTraceWorkerClient();
  const workerClient = workerRef.current;
  const baselineRef = searchParams.get('a') || '';
  const candidateRef = searchParams.get('b') || '';
  const parsedA = parseTraceSourceRef(baselineRef);
  const parsedB = parseTraceSourceRef(candidateRef);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedRow, setSelectedRow] = useState(null);

  useEffect(() => () => workerClient.dispose(), [workerClient]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    setComparison(null);
    const resolve = (ref) => {
      if (!ref) return Promise.reject(compareError('INVALID_TRACE_SOURCE_REF'));
      if (ref.source === 'live' || ref.source === 'archive') {
        return fetchTraceDocument(ref.traceId, ref.source);
      }
      return Promise.reject(compareError('INVALID_TRACE_SOURCE_REF'));
    };
    Promise.all([resolve(parsedA), resolve(parsedB)])
      .then(([baseline, candidate]) => workerClient.compare(baseline, candidate))
      .then((result) => {
        if (!current) return;
        setComparison(result);
        setLoading(false);
      })
      .catch((cause) => {
        if (!current) return;
        setError(cause);
        setLoading(false);
      });
    return () => { current = false; };
  }, [attempt, baselineRef, candidateRef, parsedA?.ref, parsedB?.ref, workerClient]);

  const swap = () => setSearchParams({ a: candidateRef, b: baselineRef });
  const baselinePath = traceRefPath(baselineRef);
  const candidatePath = traceRefPath(candidateRef);

  return (
    <>
      <PageHeader
        onBack={() => navigate(-1)}
        title={t('traceCompare.title')}
        description={t('traceCompare.description')}
      />
      <div className="trace-compare-source-bar">
        <div>
          <Tag color="blue">A · {t('traceCompare.baseline')}</Tag>
          <Text className="mono">{baselineRef}</Text>
          <Button
            type="link"
            icon={<ExportOutlined />}
            disabled={!baselinePath}
            onClick={() => baselinePath && navigate(baselinePath)}
          >
            {t('traceCompare.openSource')}
          </Button>
        </div>
        <Button icon={<SwapOutlined />} onClick={swap}>{t('traceCompare.swap')}</Button>
        <div>
          <Tag color="green">B · {t('traceCompare.candidate')}</Tag>
          <Text className="mono">{candidateRef}</Text>
          <Button
            type="link"
            icon={<ExportOutlined />}
            disabled={!candidatePath}
            onClick={() => candidatePath && navigate(candidatePath)}
          >
            {t('traceCompare.openSource')}
          </Button>
        </div>
      </div>

      <AsyncBoundary
        loading={loading}
        error={error}
        onRetry={() => setAttempt((value) => value + 1)}
      >
        {comparison && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <TraceCompareSummary summary={comparison.summary} />
            <TraceCompareTree rows={comparison.rows} onSelect={setSelectedRow} />
          </Space>
        )}
      </AsyncBoundary>
      <TraceCompareDrawer
        row={selectedRow}
        open={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
      />
    </>
  );
}
