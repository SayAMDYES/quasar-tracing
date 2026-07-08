/**
 * Small, reusable status/identity tags shared by tables, drawers and the
 * waterfall. Centralising them keeps severity/status/kind colors consistent.
 *
 * @author Quasar
 */
import { Tag } from 'antd';
import { severityMeta, spanStatusMeta, spanKindMeta, status } from '@/theme/tokens';
import { serviceColor } from '@/utils/colors';

const baseStyle = {
  border: 'none',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 600,
  lineHeight: '18px',
  paddingInline: 7,
  marginInlineEnd: 0,
};

export function SeverityTag({ value }) {
  const m = severityMeta[value] || severityMeta.INFO;
  return <Tag style={{ ...baseStyle, color: m.color, background: m.bg }}>{m.label}</Tag>;
}

export function SpanStatusTag({ value }) {
  const m = spanStatusMeta[value] || spanStatusMeta.Unset;
  return <Tag style={{ ...baseStyle, color: m.color, background: m.bg }}>{m.label}</Tag>;
}

export function SpanKindTag({ value }) {
  const m = spanKindMeta[value] || spanKindMeta.Internal;
  return (
    <Tag style={{ ...baseStyle, color: m.color, background: 'transparent', boxShadow: `inset 0 0 0 1px ${m.color}33` }}>
      {m.label}
    </Tag>
  );
}

export function EnvTag({ value }) {
  const isProd = value === 'production';
  return (
    <Tag
      style={{
        ...baseStyle,
        color: isProd ? status.info : status.neutral,
        background: isProd ? status.infoBg : status.neutralBg,
      }}
    >
      {(value || 'all').toUpperCase()}
    </Tag>
  );
}

export function ServiceBadge({ name, mono = false, dotOnly = false, style }) {
  const color = serviceColor(name);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, ...style }}>
      <span
        style={{ width: 8, height: 8, borderRadius: '50%', background: color, flex: '0 0 8px' }}
      />
      {!dotOnly && (
        <span
          className={mono ? 'mono truncate' : 'truncate'}
          style={{ fontSize: mono ? 12 : 13, color: 'var(--text)' }}
        >
          {name}
        </span>
      )}
    </span>
  );
}
