/**
 * A/B/Delta summary metrics for Trace Compare.
 *
 * @author Quasar
 */
import { Card } from 'antd';
import { useTranslation } from 'react-i18next';
import { formatDuration, formatInt } from '@/utils/format';

function signed(value, formatter) {
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const numeric = BigInt(value);
    const magnitude = numeric < 0n ? -numeric : numeric;
    return `${numeric > 0n ? '+' : numeric < 0n ? '-' : ''}${formatter(magnitude.toString())}`;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${numeric > 0 ? '+' : ''}${formatter(numeric)}`;
}

export default function TraceCompareSummary({ summary }) {
  const { t } = useTranslation();
  const metrics = [
    { key: 'duration', label: t('traceCompare.totalDuration'), duration: true },
    { key: 'spanCount', label: t('traceCompare.spanCount') },
    { key: 'errorCount', label: t('traceCompare.errorCount') },
    { key: 'serviceCount', label: t('traceCompare.serviceCount') },
    { key: 'criticalPathDuration', label: t('traceCompare.criticalDuration'), duration: true },
  ];
  return (
    <div className="trace-compare-summary">
      {metrics.map(({ key, label, duration }) => {
        const value = summary[key];
        const formatter = duration ? formatDuration : formatInt;
        return (
          <Card key={key} size="small" className="trace-compare-summary-item">
            <span className="uppercase-label">{label}</span>
            <div className="trace-compare-summary-values">
              <span><small>A</small>{formatter(value.a)}</span>
              <span><small>B</small>{formatter(value.b)}</span>
              <span className={BigInt(value.delta) > 0n ? 'is-increase' : ''}>
                <small>Delta</small>{signed(value.delta, formatter)}
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
