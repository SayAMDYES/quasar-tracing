/**
 * Runtime chart-theme option builder tests.
 *
 * @author Quasar
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChartTheme, darkTokens, lightTokens } from '../theme/tokens.js';

globalThis.localStorage = { getItem: () => 'en', setItem: () => {} };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en' }, configurable: true });
globalThis.document = { documentElement: { lang: 'en' } };

const {
  buildErrorRateChart,
  buildServiceGraph,
  buildSeverityHistogram,
  buildThroughputChart,
  buildTraceDistributionCharts,
} = await import('./options.js');

const light = createChartTheme(lightTokens);
const dark = createChartTheme(darkTokens);
const series = [{ time: 1_720_000_000_000, requests: 4, errorRate: 2, p50: 10, p90: 20, p99: 30 }];
const extent = { from: 1_720_000_000_000, to: 1_720_000_060_000 };

test('line charts project runtime tooltip, axes, split lines and series colors', () => {
  const lightOption = buildThroughputChart(series, 60_000, extent, light);
  const darkOption = buildThroughputChart(series, 60_000, extent, dark);

  assert.equal(lightOption.tooltip.backgroundColor, light.tooltipBackground);
  assert.equal(darkOption.tooltip.backgroundColor, dark.tooltipBackground);
  assert.equal(lightOption.xAxis.axisLabel.color, light.axis);
  assert.equal(darkOption.yAxis.splitLine.lineStyle.color, dark.split);
  assert.equal(lightOption.series[0].lineStyle.color, light.brand);
  assert.equal(darkOption.series[0].lineStyle.color, dark.brand);
  assert.notEqual(lightOption.tooltip.backgroundColor, darkOption.tooltip.backgroundColor);

  const darkError = buildErrorRateChart(series, 60_000, extent, dark);
  assert.equal(darkError.series[0].lineStyle.color, dark.error);
  assert.equal(darkError.series[0].markLine.label.color, dark.warn);
});

test('trace distribution and severity histogram use runtime canvas colors', () => {
  const traces = [{
    traceId: '0123456789abcdef0123456789abcdef',
    rootService: 'checkout',
    rootName: 'GET /checkout',
    startTime: extent.from,
    durationNs: 2_000_000,
    spanCount: 2,
    errorCount: 0,
    status: 'ok',
  }];
  const distribution = buildTraceDistributionCharts(traces, extent, dark);
  assert.equal(distribution.scatter.series[0].data[0].itemStyle.color, dark.ok);
  assert.equal(distribution.scatter.series[0].data[0].itemStyle.borderColor, dark.background);
  assert.equal(distribution.histogram.xAxis.axisLabel.color, dark.axis);

  const histogram = buildSeverityHistogram([{ time: extent.from, INFO: 1 }], 60_000, extent, dark);
  assert.equal(histogram.series[0].itemStyle.color, dark.severity.INFO.color);
  assert.equal(histogram.tooltip.textStyle.color, dark.text);
});

test('service graph changes legend, labels, edges and tooltip with the runtime theme', () => {
  const nodes = [
    { name: 'api', calls: 10, errorRate: 0, type: 'app', tech: 'Java' },
    { name: 'PostgreSQL · orders · database.internal:5432', calls: 5, errorRate: 0, type: 'datastore', tech: 'PostgreSQL' },
  ];
  const edges = [{ caller: 'api', callee: nodes[1].name, callCount: 5, errorRate: 0 }];
  const lightOption = buildServiceGraph(nodes, edges, null, light);
  const darkOption = buildServiceGraph(nodes, edges, null, dark);

  assert.equal(darkOption.tooltip.backgroundColor, dark.tooltipBackground);
  assert.equal(darkOption.legend.textStyle.color, dark.textSecondary);
  assert.equal(darkOption.series[0].label.color, dark.text);
  assert.equal(darkOption.series[0].label.rich.name.color, dark.text);
  assert.equal(darkOption.series[0].data[1].displayName, 'PostgreSQL\norders');
  assert.equal(darkOption.series[0].label.formatter({ data: darkOption.series[0].data[1] }), 'PostgreSQL\norders');
  assert.equal(darkOption.series[0].links[0].lineStyle.color, dark.edge);
  assert.notEqual(lightOption.series[0].label.color, darkOption.series[0].label.color);
});
