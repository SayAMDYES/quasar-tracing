/**
 * Local JSON import surface for Quasar Bundle v1 and Jaeger Query JSON.
 *
 * @author Quasar
 */
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  List,
  Row,
  Space,
  Statistic,
  Typography,
  Upload,
} from 'antd';
import { FileSearchOutlined, InboxOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/PageHeader';
import { useImportedTraces } from '@/context/ImportedTraceContext';
import { parseTraceImportFile } from '@/utils/traceImport';
import { createTraceWorkerClient } from '@/workers/traceWorkerClient';

const { Dragger } = Upload;
const { Text } = Typography;

export default function TraceImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const imported = useImportedTraces();
  const workerRef = useRef(null);
  if (!workerRef.current) workerRef.current = createTraceWorkerClient();
  const workerClient = workerRef.current;
  const [parsing, setParsing] = useState(false);
  const [report, setReport] = useState(null);
  const [sessionsByTraceId, setSessionsByTraceId] = useState({});

  useEffect(() => () => workerClient.dispose(), [workerClient]);

  const processFile = async (file) => {
    if (parsing) return;
    setParsing(true);
    try {
      const nextReport = await parseTraceImportFile(
        file,
        (text, options) => workerClient.importTrace(text, options),
      );
      setReport(nextReport);
      if (nextReport.accepted.length > 0) {
        setSessionsByTraceId(Object.fromEntries(nextReport.accepted.map((trace) => [
          trace.traceId,
          imported.addImport({
            accepted: [trace],
            rejected: [],
            warnings: nextReport.warnings.filter((item) => item.traceId === trace.traceId),
          }, { fileName: file.name }),
        ])));
      } else {
        setSessionsByTraceId({});
      }
    } finally {
      setParsing(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t('traceImport.title')}
        description={t('traceImport.sessionOnly')}
      />
      <Dragger
        className="trace-import-dropzone"
        accept=".json,application/json"
        multiple={false}
        disabled={parsing}
        showUploadList={false}
        beforeUpload={(file) => {
          void processFile(file);
          return Upload.LIST_IGNORE;
        }}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">{t('traceImport.selectFile')}</p>
        <p className="ant-upload-hint">Quasar Trace Bundle v1 / Jaeger Query JSON</p>
      </Dragger>

      {report && (
        <div className="trace-import-report">
          {report.accepted.length === 0 && (
            <Alert type="error" showIcon message={t('traceImport.noAccepted')} />
          )}
          <Row gutter={[12, 12]} className="trace-import-statistics">
            <Col xs={24} sm={8}><Card size="small"><Statistic title={t('traceImport.accepted')} value={report.accepted.length} /></Card></Col>
            <Col xs={24} sm={8}><Card size="small"><Statistic title={t('traceImport.rejected')} value={report.rejected.length} /></Card></Col>
            <Col xs={24} sm={8}><Card size="small"><Statistic title={t('traceImport.warnings')} value={report.warnings.length} /></Card></Col>
          </Row>

          {report.accepted.length > 0 && (
            <Card
              size="small"
              title={t('traceImport.importedTraces')}
              extra={(
                <Button
                  type="primary"
                  icon={<FileSearchOutlined />}
                  onClick={() => navigate(`/traces/imported/${sessionsByTraceId[report.accepted[0].traceId]}`)}
                >
                  {t('traceImport.openFirst')}
                </Button>
              )}
            >
              <List
                size="small"
                dataSource={report.accepted}
                renderItem={(trace) => (
                  <List.Item
                    actions={[
                      <Button
                        key="open"
                        type="link"
                        onClick={() => navigate(`/traces/imported/${sessionsByTraceId[trace.traceId]}`)}
                      >
                        {t('traceImport.open')}
                      </Button>,
                    ]}
                  >
                    <Space direction="vertical" size={0}>
                      <Text className="mono">{trace.traceId}</Text>
                      <Text type="secondary">{trace.root.serviceName} / {trace.root.name}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          )}

          {report.rejected.length > 0 && (
            <Card size="small" title={t('traceImport.failures')}>
              <List
                size="small"
                dataSource={report.rejected}
                renderItem={(failure) => (
                  <List.Item>
                    <Space direction="vertical" size={0}>
                      <Text type="danger" strong>{failure.code}</Text>
                      <Text type="secondary" className="mono">{failure.path}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          )}
        </div>
      )}
    </>
  );
}
