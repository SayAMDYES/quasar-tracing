/**
 * Bounded Trace Search result download workflow.
 *
 * @author Quasar
 */
import { useEffect, useRef, useState } from 'react';
import { Alert, App as AntApp, Button, List, Modal, Progress, Space, Typography } from 'antd';
import { CloseOutlined, DownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { fetchTraceDocument, searchTraces } from '@/api';
import { TRACE_DOCUMENT_LIMITS } from '@/utils/traceDocument';
import { downloadTraceDocuments } from '@/utils/downloadPool';
import { createTraceWorkerClient } from '@/workers/traceWorkerClient';

const { Text } = Typography;

function timestampForFile(date = new Date()) {
  const part = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}`
    + `-${part(date.getHours())}${part(date.getMinutes())}${part(date.getSeconds())}`;
}

export default function TraceResultsDownload({ request, total = 0 }) {
  const { t } = useTranslation();
  const { message } = AntApp.useApp();
  const workerRef = useRef(null);
  const controllerRef = useRef(null);
  const limitErrorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0, succeeded: 0, failed: 0 });
  const [failures, setFailures] = useState([]);
  const [partialDocuments, setPartialDocuments] = useState([]);
  const [errorCode, setErrorCode] = useState(null);

  useEffect(() => () => {
    controllerRef.current?.abort();
    workerRef.current?.dispose();
  }, []);

  const getWorkerClient = () => {
    if (!workerRef.current) workerRef.current = createTraceWorkerClient();
    return workerRef.current;
  };

  const close = () => {
    if (running) return;
    setOpen(false);
  };

  const createDownload = async (documents, partial, failed) => {
    const artifact = await getWorkerClient().createBundle(documents, {
      generatedAt: new Date().toISOString(),
      partial,
      failures: failed.map((failure) => ({
        traceId: failure.item,
        code: failure.code,
        message: failure.message,
      })),
    });
    const url = URL.createObjectURL(artifact.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `quasar-traces-${timestampForFile()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const start = async () => {
    if (running) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    limitErrorRef.current = null;
    setOpen(true);
    setRunning(true);
    setFailures([]);
    setPartialDocuments([]);
    setErrorCode(null);
    setProgress({ completed: 0, total: 0, succeeded: 0, failed: 0 });
    try {
      const snapshot = await searchTraces(
        { ...request, limit: 100, offset: 0 },
        { signal: controller.signal },
      );
      const traceIds = [...new Set(snapshot.items.map(({ traceId }) => traceId))].slice(0, 100);
      setProgress({ completed: 0, total: traceIds.length, succeeded: 0, failed: 0 });
      let spanCount = 0;
      let documentBytes = 0;
      const result = await downloadTraceDocuments(traceIds, async (traceId, { signal }) => {
        const document = await fetchTraceDocument(traceId, request.source || 'live', { signal });
        const artifact = await getWorkerClient().createDocument(document);
        spanCount += artifact.document.spans.length;
        documentBytes += artifact.byteSize;
        if (spanCount > TRACE_DOCUMENT_LIMITS.maxSpansPerBundle) {
          limitErrorRef.current = 'TOO_MANY_SPANS_PER_BUNDLE';
          controller.abort();
          throw new Error(limitErrorRef.current);
        }
        if (documentBytes > TRACE_DOCUMENT_LIMITS.maxBundleBytes) {
          limitErrorRef.current = 'BUNDLE_TOO_LARGE';
          controller.abort();
          throw new Error(limitErrorRef.current);
        }
        return artifact.document;
      }, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      const documents = result.results.map(({ value }) => value);
      setFailures(result.failures);
      if (documents.length === 0) {
        setErrorCode('ALL_DOWNLOADS_FAILED');
      } else if (result.failures.length > 0) {
        setPartialDocuments(documents);
      } else {
        await createDownload(documents, false, []);
        setOpen(false);
        message.success(t('traceDownload.completed'));
      }
    } catch (error) {
      if (limitErrorRef.current) setErrorCode(limitErrorRef.current);
      else if (controller.signal.aborted || error?.code === 'DOWNLOAD_CANCELLED') setOpen(false);
      else setErrorCode(error?.code || 'TRACE_DOWNLOAD_FAILED');
    } finally {
      controllerRef.current = null;
      setRunning(false);
    }
  };

  const downloadPartial = async () => {
    setRunning(true);
    setErrorCode(null);
    try {
      await createDownload(partialDocuments, true, failures);
      setOpen(false);
      message.success(t('traceDownload.partialCompleted'));
    } catch (error) {
      setErrorCode(error?.code || 'TRACE_DOWNLOAD_FAILED');
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button
        icon={<DownloadOutlined />}
        disabled={total <= 0 || running}
        onClick={start}
      >
        {total > 100 ? t('traceDownload.firstHundred') : t('traceDownload.results')}
      </Button>
      <Modal
        open={open}
        title={t('traceDownload.title')}
        onCancel={close}
        closable={!running}
        maskClosable={!running}
        footer={(
          <Space>
            {running ? (
              <Button danger icon={<CloseOutlined />} onClick={() => controllerRef.current?.abort()}>
                {t('traceDownload.cancel')}
              </Button>
            ) : (
              <Button onClick={close}>{t('traceDownload.close')}</Button>
            )}
            {!running && partialDocuments.length > 0 && (
              <Button type="primary" icon={<DownloadOutlined />} onClick={downloadPartial}>
                {t('traceDownload.confirmPartial')}
              </Button>
            )}
          </Space>
        )}
      >
        {total > 100 && (
          <Alert
            type="info"
            showIcon
            message={t('traceDownload.limitNotice')}
            style={{ marginBottom: 12 }}
          />
        )}
        {running && (
          <Progress
            percent={progress.total ? Math.round((progress.completed / progress.total) * 100) : 0}
            status="active"
          />
        )}
        <Text type="secondary">
          {t('traceDownload.progress', progress)}
        </Text>
        {errorCode && (
          <Alert
            type="error"
            showIcon
            message={t(`traceDownload.errors.${errorCode}`, { defaultValue: errorCode })}
            style={{ marginTop: 12 }}
          />
        )}
        {failures.length > 0 && (
          <>
            {partialDocuments.length > 0 && !running && (
              <Alert
                type="warning"
                showIcon
                message={t('traceDownload.partialNotice')}
                style={{ marginTop: 12 }}
              />
            )}
            <List
              className="trace-download-failures"
              size="small"
              dataSource={failures}
              renderItem={(failure) => (
                <List.Item>
                  <Space direction="vertical" size={0}>
                    <Text className="mono">{failure.item}</Text>
                    <Text type="danger">{failure.code}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </>
        )}
      </Modal>
    </>
  );
}
