/**
 * Styled filter/action bar wrapper — a white rounded surface that hosts the
 * inline filter controls at the top of search pages.
 *
 * @author Quasar
 */
export default function Toolbar({ children, extra, style, className }) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '12px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        marginBottom: 16,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        {children}
      </div>
      {extra && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{extra}</div>}
    </div>
  );
}
