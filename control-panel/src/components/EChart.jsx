/**
 * Thin, reusable ECharts wrapper. Owns the chart instance lifecycle (init,
 * option updates, resize, dispose) so pages only ever pass an `option` object.
 * This is the single integration point for ECharts across the app.
 *
 * @author Quasar
 */
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

export default function EChart({
  option,
  style,
  className,
  height = 300,
  notMerge = true,
  loading = false,
  onEvents,
  onReady,
}) {
  const elRef = useRef(null);
  const chartRef = useRef(null);
  const hasRenderedOptionRef = useRef(false);
  const eventsRef = useRef(onEvents);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  eventsRef.current = onEvents;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(media.matches);
    media.addEventListener('change', updatePreference);
    return () => media.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    const chart = echarts.init(elRef.current, null, { renderer: 'canvas' });
    chartRef.current = chart;

    const handlers = {};
    if (eventsRef.current) {
      Object.entries(eventsRef.current).forEach(([event, handler]) => {
        const wrapped = (...args) => eventsRef.current?.[event]?.(...args);
        handlers[event] = wrapped;
        chart.on(event, wrapped);
      });
    }

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(elRef.current);
    onReady?.(chart);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !option) return;

    const initial = !hasRenderedOptionRef.current;
    const motion = reducedMotion
      ? { animation: false }
      : {
          animation: true,
          animationDuration: initial ? 1000 : 500,
          animationDurationUpdate: 500,
          animationEasing: 'cubicOut',
          animationEasingUpdate: 'cubicInOut',
        };

    chart.setOption(
      { ...motion, ...option },
      {
        notMerge: initial ? notMerge : false,
        replaceMerge: !initial && notMerge ? ['series'] : undefined,
      },
    );
    hasRenderedOptionRef.current = true;
  }, [option, notMerge, reducedMotion]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (loading) chart.showLoading('default', { color: '#F26A1B', maskColor: 'rgba(255,255,255,0.6)' });
    else chart.hideLoading();
  }, [loading]);

  const classes = [className, option && 'chart-enter'].filter(Boolean).join(' ');
  return <div ref={elRef} className={classes || undefined} style={{ width: '100%', height, ...style }} />;
}
