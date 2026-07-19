/**
 * Interactive trace waterfall with filtering, time-window zoom and fixed-row
 * virtualization. Row semantics remain native buttons for predictable keyboard
 * behavior without nested interactive controls.
 *
 * @author Quasar
 */
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import TraceMinimap from '@/components/TraceMinimap';
import TraceWaterfallToolbar from '@/components/TraceWaterfallToolbar';
import { serviceColor } from '@/utils/colors';
import { formatDuration } from '@/utils/format';
import {
  buildVisibleTraceRows,
  createTraceAnalysis,
} from '@/utils/traceAnalysis';

const TICKS = [0, 0.25, 0.5, 0.75, 1];
const ROW_HEIGHT = 34;
const OVERSCAN = 8;
const EMPTY_SPANS = [];

function spanDurationMs(span) {
  const durationMs = Number(span?.durationMs);
  if (Number.isFinite(durationMs)) return Math.max(0, durationMs);
  const durationNs = Number(span?.durationNs);
  return Number.isFinite(durationNs) ? Math.max(0, durationNs / 1e6) : 0;
}

const WaterfallRow = memo(function WaterfallRow({
  row,
  windowStart,
  windowEnd,
  selected,
  collapsed,
  critical,
  onSelect,
  onToggle,
  offsetY,
}) {
  const { t } = useTranslation();
  const { span, depth, hasChildren, isMatch } = row;
  const windowDuration = Math.max(0, windowEnd - windowStart);
  const spanStart = Number(span.timestamp) || 0;
  const spanEnd = spanStart + spanDurationMs(span);
  const isVisible = windowDuration > 0 && spanEnd > windowStart && spanStart < windowEnd;
  const clippedStart = isVisible ? Math.max(spanStart, windowStart) : 0;
  const clippedEnd = isVisible ? Math.min(spanEnd, windowEnd) : 0;
  const leftPct = isVisible ? ((clippedStart - windowStart) / windowDuration) * 100 : 0;
  const widthPct = isVisible ? ((clippedEnd - clippedStart) / windowDuration) * 100 : 0;
  const isError = String(span.statusCode || '').toLowerCase() === 'error';
  const color = serviceColor(span.service);
  const durationLabel = formatDuration(spanDurationMs(span) * 1e6);
  const labelOnLeft = leftPct + widthPct > 80;
  const rowClassName = `wf-row${selected ? ' is-selected' : ''}${isError ? ' is-error' : ''}${critical ? ' is-critical' : ''}${isMatch ? ' is-match' : ''}`;
  const barClassName = `wf-bar${isError ? ' is-error' : ''}${critical ? ' is-critical' : ''}`;

  return (
    <div className={rowClassName} style={{ transform: `translateY(${offsetY}px)` }}>
      <div className="wf-label" style={{ paddingLeft: 8 + depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            className="wf-caret"
            aria-label={collapsed ? t('traceDetail.expandSpan') : t('traceDetail.collapseSpan')}
            aria-expanded={!collapsed}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(span.spanId);
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {collapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
          </button>
        ) : (
          <span className="wf-caret is-leaf" aria-hidden="true">
            <CaretDownOutlined />
          </span>
        )}
        <button
          type="button"
          className="wf-select wf-select-label"
          aria-label={`${span.name} ${span.service}`}
          onClick={() => onSelect?.(span)}
        >
          <span className="wf-dot" style={{ background: color }} />
          <span className="wf-name" title={span.name}>
            {span.name}
          </span>
          <span className="wf-svc mono" title={span.service}>{span.service}</span>
        </button>
      </div>
      <button
        type="button"
        className="wf-select wf-track"
        aria-label={`${span.name} ${durationLabel}`}
        onClick={() => onSelect?.(span)}
      >
        {[25, 50, 75].map((grid) => (
          <span key={grid} className="wf-grid" style={{ left: `${grid}%` }} />
        ))}
        {isVisible ? (
          <>
            <span
              className={barClassName}
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
              {durationLabel}
            </span>
          </>
        ) : null}
      </button>
    </div>
  );
});

export default function TraceWaterfall({
  spans = EMPTY_SPANS,
  analysis,
  selectedId,
  onSelect,
}) {
  const { t } = useTranslation();
  const bodyRef = useRef(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [services, setServices] = useState([]);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [criticalPathVisible, setCriticalPathVisible] = useState(true);
  const [viewRange, setViewRange] = useState([0, 100]);
  const [matchIndex, setMatchIndex] = useState(-1);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const traceAnalysis = useMemo(
    () => analysis || createTraceAnalysis(spans),
    [analysis, spans],
  );
  const serviceOptions = useMemo(() => (
    [...new Set(traceAnalysis.spans.map((span) => span.service).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right))
      .map((service) => ({ label: service, value: service }))
  ), [traceAnalysis]);
  const visibleResult = useMemo(() => buildVisibleTraceRows(traceAnalysis, {
    collapsedSpanIds: collapsed,
    query: deferredQuery,
    services,
    errorsOnly,
  }), [collapsed, deferredQuery, errorsOnly, services, traceAnalysis]);
  const { rows } = visibleResult;
  const orderedMatchIds = useMemo(
    () => rows.filter((row) => row.isMatch).map((row) => row.span.spanId),
    [rows],
  );
  const rowIndexById = useMemo(
    () => new Map(rows.map((row, index) => [row.span.spanId, index])),
    [rows],
  );

  useEffect(() => {
    const selectedMatchIndex = selectedId ? orderedMatchIds.indexOf(selectedId) : -1;
    setMatchIndex(selectedMatchIndex >= 0
      ? selectedMatchIndex
      : orderedMatchIds.length ? 0 : -1);
  }, [orderedMatchIds, selectedId]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    const updateHeight = () => setViewportHeight(body.clientHeight);
    updateHeight();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  const toggle = useCallback((id) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const navigateMatch = useCallback((direction) => {
    if (!orderedMatchIds.length) return;
    const selectedMatchIndex = selectedId ? orderedMatchIds.indexOf(selectedId) : -1;
    const nextIndex = selectedMatchIndex === -1
      ? direction > 0 ? 0 : orderedMatchIds.length - 1
      : (selectedMatchIndex + direction + orderedMatchIds.length) % orderedMatchIds.length;
    const spanId = orderedMatchIds[nextIndex];
    const span = traceAnalysis.byId.get(spanId);
    const rowIndex = rowIndexById.get(spanId);
    setMatchIndex(nextIndex);
    if (span) onSelect?.(span);
    if (rowIndex != null && bodyRef.current) {
      const targetTop = rowIndex * ROW_HEIGHT
        - (bodyRef.current.clientHeight - ROW_HEIGHT) / 2;
      bodyRef.current.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    }
  }, [onSelect, orderedMatchIds, rowIndexById, selectedId, traceAnalysis]);

  const reset = useCallback(() => {
    setQuery('');
    setServices([]);
    setErrorsOnly(false);
    setCollapsed(new Set());
    setCriticalPathVisible(true);
    setViewRange([0, 100]);
    setMatchIndex(-1);
    setScrollTop(0);
    bodyRef.current?.scrollTo({ top: 0 });
  }, []);

  const effectiveViewportHeight = viewportHeight || 560;

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const maxScrollTop = Math.max(0, rows.length * ROW_HEIGHT - body.clientHeight);
    if (body.scrollTop > maxScrollTop) {
      body.scrollTop = maxScrollTop;
      setScrollTop(maxScrollTop);
    }
  }, [rows.length, viewportHeight]);

  const effectiveScrollTop = Math.min(
    scrollTop,
    Math.max(0, rows.length * ROW_HEIGHT - effectiveViewportHeight),
  );
  const startIndex = Math.max(
    0,
    Math.floor(effectiveScrollTop / ROW_HEIGHT) - OVERSCAN,
  );
  const endIndex = Math.min(
    rows.length,
    Math.ceil((effectiveScrollTop + effectiveViewportHeight) / ROW_HEIGHT) + OVERSCAN,
  );
  const virtualRows = useMemo(
    () => rows.slice(startIndex, endIndex),
    [endIndex, rows, startIndex],
  );
  const traceStart = Number(traceAnalysis.traceStart) || 0;
  const traceDuration = Math.max(0, Number(traceAnalysis.durationMs) || 0);
  const windowStart = traceStart + traceDuration * (viewRange[0] / 100);
  const windowEnd = traceStart + traceDuration * (viewRange[1] / 100);
  const windowDuration = Math.max(0, windowEnd - windowStart);
  const criticalIds = traceAnalysis.criticalSpanIds || new Set();

  return (
    <div className="wf">
      <TraceWaterfallToolbar
        query={query}
        onQueryChange={setQuery}
        services={services}
        serviceOptions={serviceOptions}
        onServicesChange={setServices}
        errorsOnly={errorsOnly}
        onErrorsOnlyChange={setErrorsOnly}
        criticalPathVisible={criticalPathVisible}
        onCriticalPathVisibleChange={setCriticalPathVisible}
        matchIndex={orderedMatchIds.length ? Math.max(0, matchIndex) : -1}
        matchCount={orderedMatchIds.length}
        onPreviousMatch={() => navigateMatch(-1)}
        onNextMatch={() => navigateMatch(1)}
        onReset={reset}
      />
      <TraceMinimap
        rows={rows}
        analysis={traceAnalysis}
        viewRange={viewRange}
        criticalPathVisible={criticalPathVisible}
        onViewRangeChange={setViewRange}
      />
      <div className="wf-head">
        <div className="wf-head-label">{t('traceDetail.spanService')}</div>
        <div className="wf-axis">
          {TICKS.map((fraction) => (
            <span
              key={fraction}
              className="wf-axis-tick"
              style={{ left: `${fraction * 100}%` }}
            >
              <span>
                {formatDuration((windowStart - traceStart + windowDuration * fraction) * 1e6)}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div
        className="wf-body"
        ref={bodyRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="wf-virtual-space" style={{ height: rows.length * ROW_HEIGHT }}>
          {virtualRows.map((row, localIndex) => {
            const globalIndex = startIndex + localIndex;
            const spanId = row.span.spanId;
            return (
              <WaterfallRow
                key={spanId}
                row={row}
                windowStart={windowStart}
                windowEnd={windowEnd}
                selected={selectedId === spanId}
                collapsed={collapsed.has(spanId)}
                critical={criticalPathVisible && criticalIds.has(spanId)}
                onSelect={onSelect}
                onToggle={toggle}
                offsetY={globalIndex * ROW_HEIGHT}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
