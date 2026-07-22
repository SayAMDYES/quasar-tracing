/**
 * Fixed live/archive selector used by Trace Search and Detail.
 *
 * @author Quasar
 */
import { Select } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

export default function TraceSourceSelector({ value, onChange, enabled, auto = false }) {
  const { t } = useTranslation();
  if (!enabled) return null;

  const options = [
    ...(auto ? [{ value: 'auto', label: t('traceArchive.sourceAuto') }] : []),
    { value: 'live', label: t('traceArchive.sourceLive') },
    { value: 'archive', label: t('traceArchive.sourceArchive') },
  ];
  return (
    <Select
      aria-label={t('traceArchive.source')}
      value={value}
      options={options}
      suffixIcon={<DatabaseOutlined />}
      onChange={onChange}
      style={{ minWidth: 132 }}
    />
  );
}
