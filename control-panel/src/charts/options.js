/**
 * ECharts option builders. Pages pass data in, get a ready option object out,
 * and render it through the shared <EChart> wrapper. Centralising chart config
 * keeps styling consistent (axes, tooltips, palette) across the app.
 *
 * @author Quasar
 */
import dayjs from 'dayjs';
import i18n from '../i18n/index.js';
import { createChartTheme, lightTokens } from '../theme/tokens.js';
import { resolveServiceVisual } from '../utils/serviceVisuals.js';

const FONT = "'IBM Plex Sans', sans-serif";
const MONO = "'JetBrains Mono', monospace";
const DEFAULT_CHART_THEME = createChartTheme(lightTokens);
const LINE_MOTION = {
  animationDuration: 1100,
  animationDurationUpdate: 500,
  animationEasing: 'cubicOut',
  animationEasingUpdate: 'cubicInOut',
};

const grid = (over = {}) => ({ left: 12, right: 16, top: 28, bottom: 8, containLabel: true, ...over });
const stagger = (step, max) => (index) => Math.min(index * step, max);
const DAY_MS = 24 * 60 * 60 * 1000;

const tooltipBox = (extra = {}, chartTheme = DEFAULT_CHART_THEME) => ({
  backgroundColor: chartTheme.tooltipBackground,
  borderColor: chartTheme.tooltipBorder,
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: chartTheme.text, fontFamily: FONT, fontSize: 12 },
  extraCssText: chartTheme.tooltipShadow,
  confine: true,
  ...extra,
});

export function pickTimeStep(from, to) {
  const span = Math.max(0, Number(to || 0) - Number(from || 0));
  if (span <= 60 * 60 * 1000) return 60 * 1000;
  if (span <= 6 * 60 * 60 * 1000) return 5 * 60 * 1000;
  if (span <= DAY_MS) return 15 * 60 * 1000;
  return 60 * 60 * 1000;
}

function timeAxisBounds(extent) {
  if (!extent) return {};
  const min = Number(extent.from ?? extent.min);
  const rawMax = Number(extent.to ?? extent.max);
  if (!Number.isFinite(min) || !Number.isFinite(rawMax) || min >= rawMax) return {};
  return { min, max: Math.min(rawMax, Date.now()) };
}

function timeAxisSplitNumber(bounds) {
  if (!bounds.min || !bounds.max) return 5;
  const span = bounds.max - bounds.min;
  if (span <= 60 * 60 * 1000) return 4;
  if (span <= 6 * 60 * 60 * 1000) return 5;
  return 6;
}

function looksLikeTimeExtent(value) {
  return Boolean(value && (
    Object.prototype.hasOwnProperty.call(value, 'from')
      || Object.prototype.hasOwnProperty.call(value, 'to')
      || Object.prototype.hasOwnProperty.call(value, 'min')
      || Object.prototype.hasOwnProperty.call(value, 'max')
  ));
}

function timeAxis(step, extentOrOver = {}, maybeOver, chartTheme = DEFAULT_CHART_THEME) {
  const hasExtent = maybeOver !== undefined || looksLikeTimeExtent(extentOrOver);
  const extent = hasExtent ? extentOrOver : null;
  const over = hasExtent ? (maybeOver || {}) : extentOrOver;
  const fmt = step <= 5 * 60 * 1000 ? 'HH:mm' : step <= 60 * 60 * 1000 ? 'HH:mm' : 'MM-DD HH:mm';
  const bounds = timeAxisBounds(extent);
  return {
    type: 'time',
    axisLine: { lineStyle: { color: chartTheme.split } },
    axisTick: { show: false },
    minInterval: step,
    splitNumber: timeAxisSplitNumber(bounds),
    axisLabel: { color: chartTheme.axis, fontFamily: MONO, fontSize: 11, hideOverlap: true, formatter: (v) => dayjs(v).format(fmt) },
    splitLine: { show: false },
    ...bounds,
    ...over,
  };
}

function valueAxis(name, over = {}, chartTheme = DEFAULT_CHART_THEME) {
  return {
    type: 'value',
    name,
    nameTextStyle: { color: chartTheme.axis, fontSize: 11, padding: [0, 0, 0, -28] },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: chartTheme.axis, fontFamily: MONO, fontSize: 11 },
    splitLine: { lineStyle: { color: chartTheme.split } },
    ...over,
  };
}

const orangeArea = (chartTheme) => ({
  type: 'linear',
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color: chartTheme.brandAreaStart },
    { offset: 1, color: chartTheme.brandAreaEnd },
  ],
});

function durationMs(ns) {
  return ns == null ? 0 : ns / 1e6;
}

function formatDurationMs(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(1)}µs`;
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 2 : ms < 100 ? 1 : 0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function tracePointColor(trace, chartTheme) {
  return trace.errorCount > 0 || trace.status === 'error' ? chartTheme.error : chartTheme.ok;
}

export function buildTraceDistributionCharts(traces, timeExtent, chartTheme = DEFAULT_CHART_THEME) {
  const durations = traces.map((trace) => durationMs(trace.durationNs));
  const maxDuration = Math.max(1, ...durations);
  const minDuration = Math.min(...durations, 0);
  const binCount = Math.min(12, Math.max(4, Math.ceil(Math.sqrt(Math.max(1, traces.length)))));
  const binSize = Math.max(1, (maxDuration - minDuration) / binCount);
  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = minDuration + index * binSize;
    const end = index === binCount - 1 ? maxDuration : start + binSize;
    return { start, end, count: 0, errors: 0 };
  });

  traces.forEach((trace) => {
    const ms = durationMs(trace.durationNs);
    const index = Math.min(binCount - 1, Math.floor((ms - minDuration) / binSize));
    bins[index].count += 1;
    if (trace.errorCount > 0 || trace.status === 'error') bins[index].errors += 1;
  });

  const scatter = {
    grid: grid({ top: 14, bottom: 6, right: 24 }),
    tooltip: tooltipBox({
      formatter: (p) => {
        const trace = p.data;
        return [
          `<b>${trace.rootService || '-'}</b> · ${trace.rootName || '-'}`,
          `${i18n.t('traceSearch.colTraceId')}: <span style="font-family:${MONO}">${trace.traceId}</span>`,
          `${i18n.t('traceSearch.colStarted')}: ${dayjs(trace.value[0]).format('YYYY-MM-DD HH:mm:ss.SSS')}`,
          `${i18n.t('traceSearch.colDuration')}: <b>${formatDurationMs(trace.value[1])}</b>`,
          `${i18n.t('traceSearch.colSpans')}: ${trace.spanCount || 0} · ${i18n.t('traceSearch.colErrors')}: ${trace.errorCount || 0}`,
        ].join('<br/>');
      },
    }, chartTheme),
    xAxis: timeAxis(pickTimeStep(timeExtent?.from, timeExtent?.to), timeExtent, undefined, chartTheme),
    yAxis: valueAxis('ms', {
      min: 0,
      axisLabel: { color: chartTheme.axis, fontFamily: MONO, fontSize: 11, formatter: (v) => formatDurationMs(v) },
    }, chartTheme),
    series: [
      {
        name: i18n.t('traceSearch.distributionScatter'),
        type: 'scatter',
        animationDuration: 700,
        animationDelay: stagger(8, 360),
        animationDurationUpdate: 400,
        animationDelayUpdate: 0,
        animationEasing: 'cubicOut',
        animationEasingUpdate: 'cubicInOut',
        data: traces.map((trace) => {
          const ms = durationMs(trace.durationNs);
          const hasError = trace.errorCount > 0 || trace.status === 'error';
          return {
            traceId: trace.traceId,
            rootService: trace.rootService,
            rootName: trace.rootName,
            spanCount: trace.spanCount,
            errorCount: trace.errorCount,
            value: [trace.startTime, ms],
            symbol: hasError ? 'diamond' : 'circle',
            symbolSize: 7 + 8 * Math.sqrt(ms / maxDuration),
            itemStyle: {
              color: tracePointColor(trace, chartTheme),
              opacity: hasError ? 0.9 : 0.72,
              borderColor: chartTheme.background,
              borderWidth: 1,
            },
          };
        }),
      },
    ],
  };

  const histogram = {
    grid: grid({ left: 8, top: 14, bottom: 6 }),
    tooltip: tooltipBox({
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const bucket = params[0]?.data;
        if (!bucket) return '';
        return `${formatDurationMs(bucket.start)} - ${formatDurationMs(bucket.end)}<br/>${i18n.t('traceSearch.countTraces', { n: bucket.count })}<br/>${i18n.t('traceSearch.colErrors')}: ${bucket.errors}`;
      },
    }, chartTheme),
    xAxis: {
      type: 'category',
      data: bins.map((bucket) => `${formatDurationMs(bucket.start)}-${formatDurationMs(bucket.end)}`),
      axisLine: { lineStyle: { color: chartTheme.split } },
      axisTick: { show: false },
      axisLabel: { color: chartTheme.axis, fontFamily: MONO, fontSize: 10, interval: 0, rotate: 28 },
    },
    yAxis: valueAxis('', { minInterval: 1 }, chartTheme),
    series: [
      {
        name: i18n.t('traceSearch.distributionHistogram'),
        type: 'bar',
        animationDuration: 700,
        animationDelay: stagger(35, 360),
        animationDurationUpdate: 400,
        animationDelayUpdate: 0,
        animationEasing: 'cubicOut',
        animationEasingUpdate: 'cubicInOut',
        barMaxWidth: 26,
        cursor: 'pointer',
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: chartTheme.brand },
              { offset: 1, color: chartTheme.percentile.p50 },
            ],
          },
          borderRadius: [4, 4, 0, 0],
        },
        data: bins.map((bucket) => ({ ...bucket, value: bucket.count })),
      },
    ],
  };

  return { scatter, histogram };
}

export function buildThroughputChart(series, step, timeExtent, chartTheme = DEFAULT_CHART_THEME) {
  return {
    grid: grid(),
    tooltip: tooltipBox({
      trigger: 'axis',
      valueFormatter: (v) => `${(+v).toFixed(1)} req/s`,
    }, chartTheme),
    xAxis: timeAxis(step, timeExtent, undefined, chartTheme),
    yAxis: valueAxis('req/s', {}, chartTheme),
    series: [
      {
        name: i18n.t('chart.throughput'),
        type: 'line',
        ...LINE_MOTION,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: chartTheme.brand },
        areaStyle: { color: orangeArea(chartTheme) },
        data: series.map((p) => [p.time, p.requests]),
      },
    ],
  };
}

export function buildErrorRateChart(series, step, timeExtent, chartTheme = DEFAULT_CHART_THEME) {
  return {
    grid: grid(),
    tooltip: tooltipBox({ trigger: 'axis', valueFormatter: (v) => `${(+v).toFixed(2)}%` }, chartTheme),
    xAxis: timeAxis(step, timeExtent, undefined, chartTheme),
    yAxis: valueAxis('%', { min: 0 }, chartTheme),
    series: [
      {
        name: i18n.t('chart.errorRate'),
        type: 'line',
        ...LINE_MOTION,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: chartTheme.error },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: chartTheme.errorAreaStart },
              { offset: 1, color: chartTheme.errorAreaEnd },
            ],
          },
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: chartTheme.warn, type: 'dashed' },
          label: { formatter: `${i18n.t('chart.slo')} 5%`, color: chartTheme.warn, fontSize: 10, fontFamily: MONO },
          data: [{ yAxis: 5 }],
        },
        data: series.map((p) => [p.time, p.errorRate]),
      },
    ],
  };
}

export function buildLatencyChart(series, step, timeExtent, chartTheme = DEFAULT_CHART_THEME) {
  const line = (name, key, color, delay) => ({
    name,
    type: 'line',
    ...LINE_MOTION,
    animationDelay: delay,
    animationDelayUpdate: 0,
    smooth: true,
    showSymbol: false,
    lineStyle: { width: 2, color },
    emphasis: { focus: 'series' },
    data: series.map((p) => [p.time, p[key]]),
  });
  return {
    grid: grid({ top: 36 }),
    legend: {
      top: 0,
      right: 8,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 4,
      textStyle: { color: chartTheme.textSecondary, fontSize: 11, fontFamily: MONO },
    },
    tooltip: tooltipBox({ trigger: 'axis', valueFormatter: (v) => `${(+v).toFixed(0)} ms` }, chartTheme),
    xAxis: timeAxis(step, timeExtent, undefined, chartTheme),
    yAxis: valueAxis('ms', {}, chartTheme),
    series: [
      line('p50', 'p50', chartTheme.percentile.p50, 0),
      line('p90', 'p90', chartTheme.percentile.p90, 120),
      line('p99', 'p99', chartTheme.percentile.p99, 240),
    ],
  };
}

export function buildEndpointBar(endpoints, metric = 'p99', chartTheme = DEFAULT_CHART_THEME) {
  const sorted = [...endpoints].sort((a, b) => a[metric] - b[metric]);
  const unit = metric === 'rps' ? ' req/s' : ' ms';
  return {
    grid: grid({ left: 8, right: 56, top: 10, bottom: 8 }),
    tooltip: tooltipBox({
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => `${(+v).toFixed(metric === 'rps' ? 1 : 0)}${unit}`,
    }, chartTheme),
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: chartTheme.split } },
    },
    yAxis: {
      type: 'category',
      data: sorted.map((e) => e.operation),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: chartTheme.textSecondary, fontFamily: MONO, fontSize: 11 },
    },
    series: [
      {
        type: 'bar',
        animationDuration: 900,
        animationDelay: stagger(80, 640),
        animationDurationUpdate: 500,
        animationDelayUpdate: 0,
        animationEasing: 'cubicOut',
        animationEasingUpdate: 'cubicInOut',
        barWidth: 12,
        itemStyle: { color: chartTheme.brand, borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: 'right',
          color: chartTheme.textSecondary,
          fontFamily: MONO,
          fontSize: 11,
          formatter: (p) => `${(+p.value).toFixed(metric === 'rps' ? 1 : 0)}`,
        },
        data: sorted.map((e) => e[metric]),
      },
    ],
  };
}

export function buildSeverityHistogram(histogram, step, timeExtent, chartTheme = DEFAULT_CHART_THEME) {
  const keys = ['INFO', 'DEBUG', 'WARN', 'ERROR', 'FATAL', 'TRACE'].filter((k) =>
    histogram.some((b) => b[k]),
  );
  return {
    grid: grid({ top: 12, bottom: 4 }),
    tooltip: tooltipBox({ trigger: 'axis', axisPointer: { type: 'shadow' } }, chartTheme),
    xAxis: timeAxis(step, timeExtent, { axisLine: { show: false } }, chartTheme),
    yAxis: valueAxis('', { minInterval: 1 }, chartTheme),
    series: keys.map((k) => ({
      name: chartTheme.severity[k].label,
      type: 'bar',
      animationDuration: 900,
      animationDelay: stagger(45, 450),
      animationDurationUpdate: 500,
      animationDelayUpdate: 0,
      animationEasing: 'cubicOut',
      animationEasingUpdate: 'cubicInOut',
      stack: 'sev',
      barMaxWidth: 18,
      itemStyle: { color: chartTheme.severity[k].color },
      data: histogram.map((b) => [b.time, b[k] || 0]),
    })),
  };
}

const CATEGORY = {
  app: { idx: 0, key: 'catService', paletteIndex: 0 },
  datastore: { idx: 1, key: 'catDatastore', paletteIndex: 1 },
  mq: { idx: 2, key: 'catMessaging', paletteIndex: 5 },
  external: { idx: 3, key: 'catExternal', paletteIndex: 3 },
};

export function buildServiceGraph(nodes, edges, selected, chartTheme = DEFAULT_CHART_THEME) {
  const maxCalls = Math.max(1, ...nodes.map((n) => n.calls));
  const maxEdge = Math.max(1, ...edges.map((e) => e.callCount));
  const categories = Object.values(CATEGORY)
    .sort((a, b) => a.idx - b.idx)
    .map((c) => ({
      name: i18n.t(`serviceMap.${c.key}`),
      itemStyle: { color: chartTheme.palette[c.paletteIndex] },
    }));

  const callsLabel = i18n.t('chart.calls');
  const errorsLabel = i18n.t('chart.errors');
  const techLabel = i18n.t('service.tech');

  return {
    tooltip: tooltipBox({
      formatter: (p) => {
        if (p.dataType === 'edge') {
          return `${p.data.caller} → ${p.data.callee}<br/>${callsLabel}: <b>${p.data.callCount}</b> · ${errorsLabel}: ${(p.data.errorRate * 100).toFixed(1)}%`;
        }
        const tech = p.data.visualLabel ? `<br/>${techLabel}: <b>${p.data.visualLabel}</b>` : '';
        return `<b>${p.data.name}</b>${tech}<br/>${callsLabel}: ${p.data.calls} · ${errorsLabel}: ${(p.data.errorRate * 100).toFixed(1)}%`;
      },
    }, chartTheme),
    legend: {
      data: categories.map((c) => c.name),
      top: 8,
      left: 8,
      orient: 'vertical',
      icon: 'circle',
      itemWidth: 9,
      itemHeight: 9,
      textStyle: { color: chartTheme.textSecondary, fontSize: 12 },
    },
    series: [
      {
        type: 'graph',
        animationDuration: 1000,
        animationDelay: stagger(90, 720),
        animationDurationUpdate: 450,
        animationDelayUpdate: 0,
        animationEasing: 'cubicOut',
        animationEasingUpdate: 'cubicInOut',
        layout: 'force',
        roam: true,
        draggable: true,
        zoom: 1.05,
        label: {
          show: true,
          position: 'bottom',
          color: chartTheme.text,
          fontSize: 12,
          fontFamily: MONO,
          fontWeight: 600,
          lineHeight: 18,
          formatter: (p) => p.data.displayName,
          rich: {
            name: { color: chartTheme.text, fontSize: 12, fontFamily: MONO, fontWeight: 600 },
          },
        },
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: 7,
        force: { repulsion: 220, edgeLength: 118, gravity: 0.16, friction: 0.25 },
        emphasis: { focus: 'adjacency', lineStyle: { width: 4 } },
        categories,
        data: nodes.map((n) => {
          const unhealthy = n.errorRate > 0.05;
          const selectedNode = selected === n.name;
          const visual = resolveServiceVisual(n);
          const size = 44 + 18 * Math.sqrt(n.calls / maxCalls);
          const nameParts = n.name.split(' · ');
          const displayName = n.type === 'app' || nameParts.length < 2
            ? n.name
            : nameParts.slice(0, 2).join('\n');
          return {
            id: n.name,
            name: n.name,
            displayName,
            tech: n.tech,
            visualLabel: visual.label,
            calls: n.calls,
            errorRate: n.errorRate,
            category: CATEGORY[n.type]?.idx ?? 0,
            symbol: visual.symbol({ alert: unhealthy, selected: selectedNode }),
            symbolSize: [size, size],
            itemStyle: {
              shadowBlur: selectedNode ? 22 : 10,
              shadowColor: chartTheme.brandGlow,
            },
          };
        }),
        links: edges.map((e) => {
          const bad = e.errorRate > 0.05;
          return {
            source: e.caller,
            target: e.callee,
            caller: e.caller,
            callee: e.callee,
            callCount: e.callCount,
            errorRate: e.errorRate,
            lineStyle: {
              width: 1.2 + 3.2 * Math.sqrt(e.callCount / maxEdge),
              color: bad ? chartTheme.error : chartTheme.edge,
              opacity: bad ? 0.85 : 0.5,
              curveness: 0.12,
            },
          };
        }),
      },
    ],
  };
}

export const chartPalette = DEFAULT_CHART_THEME.palette;
