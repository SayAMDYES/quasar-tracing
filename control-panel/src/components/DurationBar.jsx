/**
 * Proportional duration bar with a monospace label. Used in the trace results
 * table (relative to the slowest trace on the page) and elsewhere.
 *
 * @author Quasar
 */
import { formatDuration } from '@/utils/format';
import { brand } from '@/theme/tokens';

export default function DurationBar({ valueNs, maxNs, color, width = 120 }) {
  const pct = maxNs ? Math.max(2, Math.min(100, (valueNs / maxNs) * 100)) : 0;
  const fill = color || (pct > 66 ? brand.primaryActive : pct > 33 ? brand.primary : '#F6A85C');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          flex: `0 0 ${width}px`,
          height: 6,
          background: '#EEF0F3',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: fill, borderRadius: 4 }} />
      </div>
      <span
        className="num"
        style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 60, textAlign: 'right' }}
      >
        {formatDuration(valueNs)}
      </span>
    </div>
  );
}
