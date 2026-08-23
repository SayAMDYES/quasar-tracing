/**
 * Styled filter/action bar wrapper — a white rounded surface that hosts the
 * inline filter controls at the top of search pages. Base styles live in
 * global.css (.toolbar/.toolbar-main/.toolbar-extra) so page-level classes
 * such as .query-toolbar can override them without !important; the style
 * prop remains available for one-off layout tweaks.
 *
 * @author Quasar
 */
export default function Toolbar({ children, extra, style, className }) {
  return (
    <div className={className ? `toolbar ${className}` : 'toolbar'} style={style}>
      <div className="toolbar-main">{children}</div>
      {extra && <div className="toolbar-extra">{extra}</div>}
    </div>
  );
}
