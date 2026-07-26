/**
 * Lazy normalized Trace Document view and copy actions.
 *
 * @author Quasar
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App as AntApp, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import AsyncBoundary from '@/components/AsyncBoundary';
import JsonDocumentViewer from '@/components/JsonDocumentViewer';
import { fetchTraceDocument } from '@/api';
import { createTraceWorkerClient } from '@/workers/traceWorkerClient';

export default function TraceJsonPanel({ traceId, source = 'auto', traceDocument = null }) {
  const { t } = useTranslation();
  const { message } = AntApp.useApp();
  const workerRef = useRef(null);
  if (!workerRef.current) workerRef.current = createTraceWorkerClient();
  const workerClient = workerRef.current;
  const [artifact, setArtifact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [copying, setCopying] = useState(false);
  const [actionError, setActionError] = useState(null);

  useEffect(() => () => workerClient.dispose(), [workerClient]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    setArtifact(null);
    const sourceRequest = traceDocument
      ? Promise.resolve(traceDocument)
      : fetchTraceDocument(traceId, source);
    sourceRequest
      .then((document) => workerClient.createDocument(document))
      .then((nextArtifact) => {
        if (!current) return;
        setArtifact(nextArtifact);
        setLoading(false);
      })
      .catch((cause) => {
        if (!current) return;
        setError(cause);
        setLoading(false);
      });
    return () => { current = false; };
  }, [attempt, source, traceDocument, traceId, workerClient]);

  const copy = useCallback(async () => {
    if (!artifact || copying) return;
    setCopying(true);
    setActionError(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('CLIPBOARD_UNAVAILABLE');
      await navigator.clipboard.writeText(artifact.canonical);
      message.success(t('traceDetail.jsonCopied'));
    } catch (cause) {
      setActionError(cause);
    } finally {
      setCopying(false);
    }
  }, [artifact, copying, message, t]);

  return (
    <div className="trace-json-panel">
      <Alert
        className="trace-json-notice"
        type="warning"
        showIcon
        message={t('traceDetail.jsonNoticeTitle')}
        description={t('traceDetail.jsonNoticeDescription')}
      />
      {actionError && (
        <Alert
          className="trace-json-action-error"
          type="error"
          showIcon
          message={t('traceDetail.jsonCopyError')}
          description={actionError?.message}
          action={(
            <Button size="small" onClick={copy}>
              {t('common.retry')}
            </Button>
          )}
        />
      )}
      <AsyncBoundary
        loading={loading}
        error={error}
        onRetry={() => setAttempt((value) => value + 1)}
      >
        {artifact && (
          <JsonDocumentViewer
            text={artifact.canonical}
            workerClient={workerClient}
            onCopy={copy}
            copying={copying}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}
