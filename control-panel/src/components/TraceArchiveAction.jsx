/**
 * Explicit Archive and logical-delete actions for one live or archived Trace.
 *
 * @author Quasar
 */
import { useEffect, useState } from 'react';
import { App as AntApp, Button, Popconfirm } from 'antd';
import { DeleteOutlined, InboxOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { archiveTrace, deleteTraceArchive } from '@/api';

export default function TraceArchiveAction({ traceId, archived, enabled, onArchived, onDeleted }) {
  const { t } = useTranslation();
  const { message } = AntApp.useApp();
  const [pending, setPending] = useState(false);
  const [archivedState, setArchivedState] = useState(archived);
  useEffect(() => setArchivedState(archived), [archived]);
  if (!enabled) return null;

  const archive = async () => {
    setPending(true);
    try {
      const result = await archiveTrace(traceId);
      message.success(result.created ? t('traceArchive.archiveCreated') : t('traceArchive.archiveExists'));
      setArchivedState(true);
      onArchived?.(result.archive);
    } catch (error) {
      message.error(error?.message || t('traceArchive.archiveFailed'));
    } finally {
      setPending(false);
    }
  };
  const remove = async () => {
    setPending(true);
    try {
      await deleteTraceArchive(traceId);
      message.success(t('traceArchive.deleteCompleted'));
      onDeleted?.();
    } catch (error) {
      message.error(error?.message || t('traceArchive.deleteFailed'));
    } finally {
      setPending(false);
    }
  };

  return archivedState ? (
    <Popconfirm
      title={t('traceArchive.deleteTitle')}
      description={t('traceArchive.deleteDescription')}
      okText={t('traceArchive.delete')}
      cancelText={t('common.cancel')}
      okButtonProps={{ danger: true }}
      onConfirm={remove}
    >
      <Button danger icon={<DeleteOutlined />} loading={pending}>
        {t('traceArchive.delete')}
      </Button>
    </Popconfirm>
  ) : (
    <Popconfirm
      title={t('traceArchive.archiveTitle')}
      description={t('traceArchive.archiveDescription')}
      okText={t('traceArchive.archive')}
      cancelText={t('common.cancel')}
      onConfirm={archive}
    >
      <Button icon={<InboxOutlined />} loading={pending}>
        {t('traceArchive.archive')}
      </Button>
    </Popconfirm>
  );
}
