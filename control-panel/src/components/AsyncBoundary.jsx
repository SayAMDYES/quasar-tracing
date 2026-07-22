/**
 * Handles the loading / error / empty states around an async data region so
 * pages don't reimplement them. Use for initial page loads; data tables can use
 * their own `loading` prop for in-place refetches.
 *
 * @author Quasar
 */
import { Skeleton, Result, Button, Empty } from 'antd';
import { useTranslation } from 'react-i18next';

export default function AsyncBoundary({
  loading,
  error,
  empty,
  onRetry,
  skeleton,
  children,
  emptyText,
  errorTitle,
  errorDescription,
}) {
  const { t } = useTranslation();

  if (loading) {
    return skeleton !== undefined ? (
      skeleton
    ) : (
      <Skeleton active paragraph={{ rows: 6 }} style={{ padding: 20 }} />
    );
  }
  if (error) {
    return (
      <Result
        status="warning"
        title={errorTitle || t('common.loadError')}
        subTitle={errorDescription || error.message}
        extra={onRetry && (
          <Button type="primary" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )}
      />
    );
  }
  if (empty) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={emptyText || t('common.noData')}
        style={{ padding: '48px 0' }}
      />
    );
  }
  return children;
}
