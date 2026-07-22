/**
 * Compact overview and time-window control for the trace waterfall.
 *
 * @author Quasar
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Slider } from 'antd';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '@/context/ThemeContext';
import { serviceColor } from '@/utils/colors';

const MIN_RANGE_WIDTH = 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampRange(range) {
  const first = Number(range?.[0]);
  const second = Number(range?.[1]);
  let start = clamp(Number.isFinite(first) ? first : 0, 0, 100);
  let end = clamp(Number.isFinite(second) ? second : 100, 0, 100);
  if (start > end) [start, end] = [end, start];
  if (end - start < MIN_RANGE_WIDTH) {
    if (start + MIN_RANGE_WIDTH <= 100) end = start + MIN_RANGE_WIDTH;
    else start = end - MIN_RANGE_WIDTH;
  }
  return [start, end];
}

function spanDurationMs(span) {
  const durationMs = Number(span?.durationMs);
  if (Number.isFinite(durationMs)) return Math.max(0, durationMs);
  const durationNs = Number(span?.durationNs);
  return Number.isFinite(durationNs) ? Math.max(0, durationNs / 1e6) : 0;
}

export default function TraceMinimap({
  rows,
  analysis,
  viewRange,
  criticalPathVisible,
  onViewRangeChange,
}) {
  const { t } = useTranslation();
  const { tokens } = useThemeMode();
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const normalizedRange = useMemo(
    () => clampRange(viewRange),
    [viewRange],
  );

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const resizeCanvas = () => {
      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
      const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      setCanvasSize((current) => (
        current.width === width && current.height === height
          ? current
          : { width, height }
      ));
    };

    resizeCanvas();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const { width, height } = canvasSize;
    context.clearRect(0, 0, width, height);
    if (!rows.length || !analysis) return;

    const traceStart = Number(analysis.traceStart) || 0;
    const traceDuration = Math.max(Number.EPSILON, Number(analysis.durationMs) || 0);
    const criticalIds = analysis.criticalSpanIds || new Set();
    rows.forEach(({ span }, index) => {
      const start = Number(span?.timestamp) || traceStart;
      const end = start + spanDurationMs(span);
      const left = clamp(
        Math.floor(((start - traceStart) / traceDuration) * width),
        0,
        width - 1,
      );
      const right = clamp(
        Math.ceil(((end - traceStart) / traceDuration) * width),
        left + 1,
        width,
      );
      const top = clamp(Math.floor((index / rows.length) * height), 0, height - 1);
      const bottom = clamp(
        Math.ceil(((index + 1) / rows.length) * height),
        top + 1,
        height,
      );
      const isError = String(span?.statusCode || '').toLowerCase() === 'error';
      const isCritical = criticalPathVisible && criticalIds.has(span?.spanId);
      context.fillStyle = isError
        ? tokens.status.error
        : isCritical
          ? tokens.status.warn
          : serviceColor(span?.service, tokens.chartPalette);
      context.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
    });
  }, [analysis, canvasSize, criticalPathVisible, rows, tokens]);

  const handleCanvasClick = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const center = clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100);
    const width = normalizedRange[1] - normalizedRange[0];
    const start = clamp(center - width / 2, 0, 100 - width);
    onViewRangeChange([start, start + width]);
  };

  return (
    <div className="wf-minimap">
      <div className="wf-minimap-canvas">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          onClick={handleCanvasClick}
        />
        <div
          className="wf-minimap-viewport"
          style={{
            left: `${normalizedRange[0]}%`,
            width: `${normalizedRange[1] - normalizedRange[0]}%`,
          }}
        />
      </div>
      <div className="wf-minimap-slider">
        <span>{t('traceDetail.timeWindow')}</span>
        <Slider
          range
          min={0}
          max={100}
          step={0.1}
          pushable={MIN_RANGE_WIDTH}
          value={normalizedRange}
          ariaLabelForHandle={[
            t('traceDetail.timeWindowStart'),
            t('traceDetail.timeWindowEnd'),
          ]}
          tooltip={{ formatter: (value) => `${Math.round(value)}%` }}
          onChange={(range) => onViewRangeChange(clampRange(range))}
        />
      </div>
    </div>
  );
}
