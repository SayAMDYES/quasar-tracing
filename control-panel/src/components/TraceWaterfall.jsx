/**
 * Interactive trace waterfall — the centrepiece of the trace detail view.
 * Reconstructs the span tree from the flat span list (ParentSpanId), lays each
 * span on a shared time axis, and supports collapsing subtrees and selecting a
 * span. Pure DOM/CSS (see .wf-* rules in global.css) for crisp, dense rendering.
 *
 * @author Quasar
 */
import { useMemo, useState } from 'react';
import { CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { serviceColor } from '@/utils/colors';
import { formatDuration } from '@/utils/format';

const TICKS = [0, 0.25, 0.5, 0.75, 1];

function buildRows(spans, collapsed) {
  if (!spans || !spans.length) return { rows: [], total: 1, traceStart: 0 };
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const childrenMap = new Map();
  for (const s of spans) {
    const pid = s.parentSpanId && byId.has(s.parentSpanId) ? s.parentSpanId : '__root__';
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid).push(s);
  }
  for (const arr of childrenMap.values()) arr.sort((a, b) => a.timestamp - b.timestamp);

  const traceStart = Math.min(...spans.map((s) => s.timestamp));
  const traceEnd = Math.max(...spans.map((s) => s.timestamp + s.durationMs));
  const total = Math.max(1, traceEnd - traceStart);

  const rows = [];
  const walk = (span, depth) => {
    const kids = childrenMap.get(span.spanId) || [];
    rows.push({ span, depth, hasChildren: kids.length > 0 });
    if (!collapsed.has(span.spanId)) kids.forEach((k) => walk(k, depth + 1));
  };
  (childrenMap.get('__root__') || []).forEach((r) => walk(r, 0));
  return { rows, total, traceStart };
}

function WaterfallRow({ row, total, traceStart, selected, collapsed, onSelect, onToggle }) {
  const { span, depth, hasChildren } = row;
  const leftPct = ((span.timestamp - traceStart) / total) * 100;
  const widthPct = Math.max(0.6, (span.durationMs / total) * 100);
  const isError = span.statusCode === 'Error';
  const color = serviceColor(span.service);
  const labelOnLeft = leftPct + widthPct > 80;

  return (
    <div
      className={`wf-row${selected ? ' is-selected' : ''}${isError ? ' is-error' : ''}`}
      onClick={() => onSelect(span)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(span);
        }
      }}
    >
      <div className="wf-label" style={{ paddingLeft: 8 + depth * 14 }}>
        <span
          className={`wf-caret${hasChildren ? '' : ' is-leaf'}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(span.spanId);
          }}
        >
          {collapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
        </span>
        <span className="wf-dot" style={{ background: color }} />
        <span className="wf-name" title={span.name}>
          {span.name}
        </span>
        <span className="wf-svc mono">{span.service}</span>
      </div>
      <div className="wf-track">
        {[25, 50, 75].map((g) => (
          <span key={g} className="wf-grid" style={{ left: `${g}%` }} />
        ))}
        <span
          className={`wf-bar${isError ? ' is-error' : ''}`}
          style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: color }}
        />
        <span
          className="wf-dur"
          style={
            labelOnLeft
              ? { right: `${100 - leftPct}%`, marginRight: 6 }
              : { left: `${leftPct + widthPct}%`, marginLeft: 6 }
          }
        >
          {formatDuration(span.durationNs)}
        </span>
      </div>
    </div>
  );
}

export default function TraceWaterfall({ spans, selectedId, onSelect }) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(() => new Set());
  const { rows, total, traceStart } = useMemo(() => buildRows(spans, collapsed), [spans, collapsed]);

  const toggle = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="wf">
      <div className="wf-head">
        <div className="wf-head-label">{t('traceDetail.spanService')}</div>
        <div className="wf-axis">
          {TICKS.map((f) => (
            <span key={f} className="wf-axis-tick" style={{ left: `${f * 100}%` }}>
              <span>{formatDuration(total * f * 1e6)}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="wf-body">
        {rows.map((row) => (
          <WaterfallRow
            key={row.span.spanId}
            row={row}
            total={total}
            traceStart={traceStart}
            selected={selectedId === row.span.spanId}
            collapsed={collapsed.has(row.span.spanId)}
            onSelect={onSelect}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}
