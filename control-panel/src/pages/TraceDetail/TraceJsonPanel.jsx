/**
 * Lazy normalized Trace Document view and single-Trace export actions.
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
  const [downloading, setDownloading] = useState(false);
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
      setActionError({ type: 'copy', cause });
    } finally {
      setCopying(false);
    }
  }, [artifact, copying, message, t]);

  const download = useCallback(async () => {
    if (!artifact || downloading) return;
    setDownloading(true);
    setActionError(null);
    try {
      const bundleArtifact = await workerClient.createBundle([artifact.document], {
        generatedAt: new Date().toISOString(),
      });
      const url = URL.createObjectURL(bundleArtifact.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `quasar-trace-${artifact.document.traceId}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (cause) {
      setActionError({ type: 'download', cause });
    } finally {
      setDownloading(false);
    }
  }, [artifact, downloading, workerClient]);

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
          message={actionError.type === 'copy'
            ? t('traceDetail.jsonCopyError') : t('traceDetail.jsonDownloadError')}
          description={actionError.cause?.message}
          action={(
            <Button size="small" onClick={actionError.type === 'copy' ? copy : download}>
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
            onDownload={download}
            copying={copying}
            downloading={downloading}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}
