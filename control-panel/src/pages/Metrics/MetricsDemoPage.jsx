/**
 * Metrics demo — mock-data preview for a Grafana/Prometheus-inspired service
 * metrics workspace. Kept separate from the real /metrics read path.
 *
 * @author Quasar
 */
import { useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Flex,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  ApartmentOutlined,
  BugOutlined,
  ClockCircleOutlined,
  CloudServerOutlined,
  CodeOutlined,
  ContainerOutlined,
  FireOutlined,
  LineChartOutlined,
  PartitionOutlined,
  RadarChartOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import EChart from '@/components/EChart';
import { ServiceBadge } from '@/components/tags';
import { brand, neutral, status } from '@/theme/tokens';
import { useThemeMode } from '@/context/ThemeContext';
import { formatInt, formatMs, formatNumber, formatPercent } from '@/utils/format';

const { Text, Title } = Typography;

const TECH = {
  shell: '#07111F',
  shellSoft: '#0B1729',
  panel: 'rgba(9, 22, 38, 0.82)',
  panelSolid: '#101B2D',
  panelBorder: 'rgba(122, 166, 255, 0.22)',
  grid: 'rgba(111, 197, 255, 0.10)',
  text: '#EAF2FF',
  textSecondary: 'rgba(234, 242, 255, 0.70)',
  textMuted: 'rgba(234, 242, 255, 0.46)',
  cyan: '#40C8FF',
  blue: '#4E8DFF',
  orange: '#F26A1B',
  red: '#FF5C7A',
  green: '#38D996',
  violet: '#9B7CFF',
};

const SERVICES = ['order-service', 'payment-service', 'inventory-service'];
const ENVIRONMENTS = ['prod', 'staging'];
const STEP = 30 * 60 * 1000;
const NOW = new Date('2026-07-03T14:30:00+08:00').getTime();

const INSTANCES = [
  {
    id: 'pod/order-7c9f6b9c5f-k48ps',
    shortName: 'order-k48ps',
    runtime: 'Kubernetes Pod',
    runtimeType: 'pod',
    status: 'healthy',
    rps: 168,
    errorRate: 0.004,
    p99: 286,
    cpu: 58,
    memory: 64,
    serviceInstanceId: '7f3f6ec4-9122-4a6d-9d4f-1f2c5a2a5811',
    containerId: 'containerd://8f41c9d2b7a1',
    image: 'registry.local/order-service:1.8.2',
    host: 'worker-a',
    namespace: 'prod-orders',
    podName: 'order-7c9f6b9c5f-k48ps',
    podUid: '7f3f6ec4-9122-4a6d-9d4f-1f2c5a2a5811',
    nodeName: 'worker-a',
    source: 'Downward API + OTEL_RESOURCE_ATTRIBUTES',
    noteKey: 'metricsDemo.noteK8s',
  },
  {
    id: 'pod/order-7c9f6b9c5f-nd2mq',
    shortName: 'order-nd2mq',
    runtime: 'Kubernetes Pod',
    runtimeType: 'pod',
    status: 'degraded',
    rps: 194,
    errorRate: 0.021,
    p99: 612,
    cpu: 71,
    memory: 78,
    serviceInstanceId: '135e6fa5-050d-4d79-a827-9f1e6b8570b7',
    containerId: 'containerd://1a67470e6c9e',
    image: 'registry.local/order-service:1.8.2',
    host: 'worker-b',
    namespace: 'prod-orders',
    podName: 'order-7c9f6b9c5f-nd2mq',
    podUid: '135e6fa5-050d-4d79-a827-9f1e6b8570b7',
    nodeName: 'worker-b',
    source: 'Downward API + OTEL_RESOURCE_ATTRIBUTES',
    noteKey: 'metricsDemo.noteP99',
  },
  {
    id: 'docker/order-compose-01',
    shortName: 'compose-01',
    runtime: 'Docker / Compose',
    runtimeType: 'docker',
    status: 'unhealthy',
    rps: 52,
    errorRate: 0.074,
    p99: 1280,
    cpu: 86,
    memory: 82,
    serviceInstanceId: 'order-compose-01',
    containerId: 'b3c8b7a4d7f2',
    image: 'order-service:local-1.8.2',
    host: 'vm-compose-01',
    namespace: '—',
    podName: '—',
    podUid: '—',
    nodeName: '—',
    source: 'Compose env + HOSTNAME',
    noteKey: 'metricsDemo.noteDocker',
  },
  {
    id: 'bare/order-devbox-01',
    shortName: 'bare-java-01',
    runtime: 'Bare Java',
    runtimeType: 'bare',
    status: 'healthy',
    rps: 10,
    errorRate: 0.002,
    p99: 220,
    cpu: 24,
    memory: 39,
    serviceInstanceId: 'host-a:order-service:9201',
    containerId: '—',
    image: '—',
    host: 'host-a',
    namespace: '—',
    podName: '—',
    podUid: '—',
    nodeName: '—',
    source: 'host/process attributes',
    noteKey: 'metricsDemo.noteBare',
  },
];

function point(i) {
  const spike = i >= 31 && i <= 35 ? 1 : 0;
  const recovery = i > 35 ? Math.max(0, 1 - (i - 36) / 8) : 0;
  const requests = 420 + Math.sin(i / 3) * 90 + spike * 260 + recovery * 120;
  const errorRate = 0.006 + spike * 0.057 + (i % 17 === 0 ? 0.011 : 0);
  const p50 = 76 + Math.sin(i / 5) * 11 + spike * 28;
  const p90 = 168 + Math.sin(i / 4) * 24 + spike * 156 + recovery * 48;
  const p99 = 352 + Math.sin(i / 6) * 52 + spike * 680 + recovery * 140;
  return {
    time: NOW - (47 - i) * STEP,
    requests: Math.round(requests),
    errorRate,
    errors: Math.round(requests * errorRate),
    p50: Math.round(p50),
    p90: Math.round(p90),
    p99: Math.round(p99),
  };
}

const SERIES = Array.from({ length: 48 }, (_, i) => point(i));

const ENDPOINTS = [
  {
    operation: 'POST /api/orders',
    requestCount: 682_340,
    rps: 15.8,
    errors: 48_104,
    errorRate: 0.071,
    p50: 118,
    p90: 356,
    p99: 1120,
    trendKey: 'metricsDemo.trendInventory',
  },
  {
    operation: 'POST /api/payments/confirm',
    requestCount: 196_432,
    rps: 4.5,
    errors: 8_448,
    errorRate: 0.043,
    p50: 146,
    p90: 488,
    p99: 1380,
    trendKey: 'metricsDemo.trendPayment',
  },
  {
    operation: 'POST /api/inventory/reserve',
    requestCount: 97_840,
    rps: 2.3,
    errors: 2_544,
    errorRate: 0.026,
    p50: 133,
    p90: 412,
    p99: 986,
    trendKey: 'metricsDemo.trendRedis',
  },
  {
    operation: 'GET /api/products/search',
    requestCount: 388_920,
    rps: 9.0,
    errors: 4_667,
    errorRate: 0.012,
    p50: 92,
    p90: 208,
    p99: 481,
    trendKey: 'metricsDemo.trendLongTail',
  },
  {
    operation: 'GET /api/orders/{id}',
    requestCount: 451_208,
    rps: 10.4,
    errors: 1_805,
    errorRate: 0.004,
    p50: 64,
    p90: 142,
    p99: 288,
    trendKey: 'metricsDemo.trendStable',
  },
  {
    operation: 'GET /api/users/{id}',
    requestCount: 154_882,
    rps: 3.6,
    errors: 465,
    errorRate: 0.003,
    p50: 52,
    p90: 96,
    p99: 174,
    trendKey: 'metricsDemo.trendStable',
  },
];

const JVM = [
  { metric: 'Heap used', value: 68, tone: status.warn, detail: '2.7 GB / 4 GB' },
  { metric: 'GC pause p99', value: 42, tone: status.ok, detail: '42 ms' },
  { metric: 'CPU usage', value: 73, tone: status.warn, detail: '5.8 / 8 cores' },
  { metric: 'Live threads', value: 61, tone: status.info, detail: '342 threads' },
];

const EXPLORER = [
  { name: 'http.server.request.duration', type: 'histogram', series: 924, lastSeen: '14:30:00' },
  { name: 'process.runtime.jvm.memory.usage', type: 'gauge', series: 168, lastSeen: '14:30:00' },
  { name: 'process.cpu.utilization', type: 'gauge', series: 42, lastSeen: '14:30:00' },
  { name: 'messaging.kafka.consumer.lag', type: 'sum', series: 36, lastSeen: '14:29:30' },
];

const cardStyle = {
  height: '100%',
  borderRadius: 14,
  boxShadow: '0 10px 28px rgba(16, 24, 40, 0.06)',
};

const glassCardStyle = {
  height: '100%',
  border: `1px solid ${TECH.panelBorder}`,
  borderRadius: 18,
  background:
    'linear-gradient(145deg, rgba(14, 28, 48, 0.92), rgba(8, 17, 31, 0.86)) padding-box, linear-gradient(135deg, rgba(64, 200, 255, 0.38), rgba(242, 106, 27, 0.30), rgba(155, 124, 255, 0.26)) border-box',
  boxShadow: '0 22px 60px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
};

const surfaceCardStyle = {
  ...cardStyle,
  border: '1px solid rgba(16, 24, 40, 0.08)',
  boxShadow: '0 16px 40px rgba(16, 24, 40, 0.08)',
};

function fmtTime(v) {
  return dayjs(v).format('HH:mm');
}

function latest() {
  return SERIES[SERIES.length - 1];
}

function previous() {
  return SERIES[SERIES.length - 9];
}

function delta(current, base) {
  return base ? (current - base) / base : 0;
}

function healthTone(value, warn, bad) {
  if (value >= bad) return status.error;
  if (value >= warn) return status.warn;
  return status.ok;
}

function TechStyles() {
  return (
    <style>
      {`
        .metrics-demo-shell {
          position: relative;
          margin: -8px -8px 0;
          padding: 0 8px 10px;
          isolation: isolate;
        }

        .metrics-demo-shell::before {
          content: '';
          position: absolute;
          inset: -28px -32px auto -32px;
          height: 420px;
          border-radius: 0 0 36px 36px;
          background:
            radial-gradient(circle at 16% 18%, rgba(64, 200, 255, 0.22), transparent 28%),
            radial-gradient(circle at 78% 6%, rgba(242, 106, 27, 0.20), transparent 26%),
            linear-gradient(135deg, ${TECH.shell} 0%, ${TECH.shellSoft} 58%, #111426 100%);
          z-index: -2;
        }

        .metrics-demo-shell::after {
          content: '';
          position: absolute;
          inset: -28px -32px auto -32px;
          height: 420px;
          border-radius: 0 0 36px 36px;
          background-image:
            linear-gradient(${TECH.grid} 1px, transparent 1px),
            linear-gradient(90deg, ${TECH.grid} 1px, transparent 1px);
          background-size: 34px 34px;
          mask-image: linear-gradient(to bottom, rgba(0,0,0,0.92), transparent 88%);
          z-index: -1;
          animation: metrics-grid-drift 16s linear infinite;
        }

        .metrics-demo-hero,
        .metrics-demo-panel,
        .metrics-demo-card {
          animation: metrics-panel-enter 720ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .metrics-demo-hero {
          overflow: hidden;
          position: relative;
        }

        .metrics-demo-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.05) 42%, rgba(64,200,255,0.13) 50%, transparent 60%),
            radial-gradient(circle at 88% 18%, rgba(64, 200, 255, 0.18), transparent 24%);
          transform: translateX(-42%);
          animation: metrics-hero-scan 7.5s ease-in-out infinite;
          pointer-events: none;
        }

        .metrics-demo-kpi .ant-card-body,
        .metrics-demo-panel .ant-card-body,
        .metrics-demo-hero .ant-card-body {
          position: relative;
          z-index: 1;
        }

        .metrics-demo-kpi {
          overflow: hidden;
          transition:
            transform 220ms ease,
            border-color 220ms ease,
            box-shadow 220ms ease;
        }

        .metrics-demo-kpi::after {
          content: '';
          position: absolute;
          inset: -80px auto auto -80px;
          width: 180px;
          height: 180px;
          border-radius: 999px;
          background: radial-gradient(circle, var(--metric-glow, rgba(64,200,255,0.18)), transparent 66%);
          opacity: 0.7;
          pointer-events: none;
        }

        .metrics-demo-kpi:hover {
          transform: translateY(-4px);
          border-color: rgba(64, 200, 255, 0.34) !important;
          box-shadow: 0 22px 50px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(64, 200, 255, 0.08) inset !important;
        }

        .metrics-demo-panel {
          overflow: hidden;
          position: relative;
        }

        .metrics-demo-panel::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 0% 0%, rgba(64, 200, 255, 0.10), transparent 24%),
            linear-gradient(180deg, rgba(255,255,255,0.04), transparent 38%);
          pointer-events: none;
        }

        .metrics-demo-mini-chart {
          border: 1px solid rgba(122, 166, 255, 0.16);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.03);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
        }

        .metrics-demo-light-card {
          transition:
            transform 180ms ease,
            box-shadow 180ms ease,
            border-color 180ms ease;
        }

        .metrics-demo-light-card:hover {
          transform: translateY(-2px);
          border-color: rgba(242, 106, 27, 0.24) !important;
          box-shadow: 0 18px 42px rgba(16, 24, 40, 0.12) !important;
        }

        .metrics-instance-expanded {
          padding: 4px 8px 8px 44px;
          animation: metrics-expand 260ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .metrics-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          display: inline-block;
          box-shadow: 0 0 0 3px currentColor;
          opacity: 0.82;
        }

        .metrics-demo-shell .ant-table-row-expand-icon {
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            color 180ms ease;
        }

        .metrics-demo-shell .ant-table-row-expand-icon-expanded {
          transform: rotate(90deg);
          border-color: ${brand.primary};
          color: ${brand.primary};
        }

        @keyframes metrics-panel-enter {
          from {
            opacity: 0;
            transform: translateY(14px);
            filter: blur(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
        }

        @keyframes metrics-expand {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes metrics-hero-scan {
          0%, 32% {
            transform: translateX(-72%);
            opacity: 0;
          }
          48% {
            opacity: 1;
          }
          78%, 100% {
            transform: translateX(68%);
            opacity: 0;
          }
        }

        @keyframes metrics-grid-drift {
          from {
            background-position: 0 0, 0 0;
          }
          to {
            background-position: 34px 34px, 34px 34px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .metrics-demo-shell::after,
          .metrics-demo-hero::before,
          .metrics-demo-hero,
          .metrics-demo-panel,
          .metrics-demo-card,
          .metrics-instance-expanded {
            animation: none !important;
          }

          .metrics-demo-kpi,
          .metrics-demo-light-card {
            transition: none !important;
          }
        }
      `}
    </style>
  );
}

function buildLineChart({ fields, unit, min = 0, threshold, dark = false }) {
  const axisColor = dark ? TECH.textMuted : neutral.textMuted;
  const splitColor = dark ? 'rgba(122, 166, 255, 0.12)' : neutral.border;
  const tooltipBg = dark ? 'rgba(8, 17, 31, 0.96)' : '#FFFFFF';
  const tooltipBorder = dark ? 'rgba(64, 200, 255, 0.24)' : '#E3E6EA';
  const tooltipText = dark ? TECH.text : neutral.text;

  return {
    grid: { left: 10, right: 18, top: 28, bottom: 10, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderWidth: 1,
      textStyle: { color: tooltipText, fontFamily: 'var(--font-sans)', fontSize: 12 },
      valueFormatter: (v) => `${Number(v).toFixed(unit === '%' ? 2 : 0)} ${unit}`,
      extraCssText: dark
        ? 'box-shadow: 0 12px 32px rgba(0,0,0,.38); border-radius: 10px; backdrop-filter: blur(10px);'
        : 'box-shadow: 0 8px 24px rgba(16,24,40,.12); border-radius: 10px;',
    },
    legend:
      fields.length > 1
        ? {
            top: 0,
            right: 4,
            icon: 'roundRect',
            itemWidth: 12,
            itemHeight: 4,
            textStyle: { color: dark ? TECH.textSecondary : neutral.textSecondary, fontFamily: 'var(--font-mono)', fontSize: 11 },
          }
        : undefined,
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: splitColor } },
      axisTick: { show: false },
      axisLabel: { color: axisColor, fontFamily: 'var(--font-mono)', fontSize: 11, formatter: fmtTime },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min,
      name: unit,
      nameTextStyle: { color: axisColor, fontSize: 11, padding: [0, 0, 0, -24] },
      axisLabel: { color: axisColor, fontFamily: 'var(--font-mono)', fontSize: 11 },
      splitLine: { lineStyle: { color: splitColor } },
    },
    series: fields.map((field, index) => ({
      name: field.name,
      type: 'line',
      smooth: true,
      showSymbol: false,
      animationDuration: 900,
      animationDelay: index * 90,
      lineStyle: {
        width: field.width || 2,
        color: field.color,
        shadowBlur: dark ? 12 : 0,
        shadowColor: dark ? `${field.color}66` : undefined,
      },
      areaStyle: field.area
        ? {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${field.color}2E` },
                { offset: 1, color: `${field.color}03` },
              ],
            },
          }
        : undefined,
      markLine:
        threshold && index === 0
          ? {
              silent: true,
              symbol: 'none',
              lineStyle: { color: dark ? TECH.orange : status.warn, type: 'dashed' },
              label: {
                formatter: threshold.label,
                color: dark ? TECH.orange : status.warn,
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              },
              data: [{ yAxis: threshold.value }],
            }
          : undefined,
      data: SERIES.map((p) => [p.time, p[field.key]]),
    })),
  };
}

function buildLatencyHeatmap(tokens) {
  const { neutral: runtimeNeutral } = tokens;
  const buckets = [100, 200, 400, 800, 1200, 1800];
  const data = [];
  SERIES.forEach((p, x) => {
    buckets.forEach((bucket, y) => {
      const distance = Math.abs(bucket - p.p99);
      const intensity = Math.max(0, 9 - Math.round(distance / 150)) + (p.errorRate > 0.04 ? 2 : 0);
      data.push([x, y, intensity]);
    });
  });
  return {
    grid: { left: 50, right: 16, top: 14, bottom: 34 },
    tooltip: {
      position: 'top',
      formatter: (p) => `${fmtTime(SERIES[p.value[0]].time)}<br/>≤ ${buckets[p.value[1]]} ms · density ${p.value[2]}`,
    },
    xAxis: {
      type: 'category',
      data: SERIES.map((p) => fmtTime(p.time)),
      axisLabel: { color: runtimeNeutral.textMuted, fontFamily: 'var(--font-mono)', fontSize: 10, interval: 7 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: runtimeNeutral.border } },
    },
    yAxis: {
      type: 'category',
      data: buckets.map((b) => `≤${b}ms`),
      axisLabel: { color: runtimeNeutral.textMuted, fontFamily: 'var(--font-mono)', fontSize: 10 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    visualMap: {
      min: 0,
      max: 11,
      show: false,
      inRange: { color: tokens.mode === 'dark'
        ? ['#2A1D18', '#A94F25', '#FF8A47', '#FF7479']
        : ['#FFF7ED', '#FDBA74', '#F26A1B', '#B42318'] },
    },
    series: [{ type: 'heatmap', data, itemStyle: { borderColor: runtimeNeutral.surface, borderWidth: 1 } }],
  };
}

function runtimeMeta(type) {
  if (type === 'pod') return { icon: <CloudServerOutlined />, color: status.info, labelKey: 'runtime.kubernetesPod' };
  if (type === 'docker') return { icon: <ContainerOutlined />, color: status.warn, labelKey: 'runtime.dockerCompose' };
  return { icon: <CodeOutlined />, color: status.neutral, labelKey: 'runtime.bareJava' };
}

function statusMeta(value) {
  if (value === 'unhealthy') return { color: status.error, labelKey: 'overview.unhealthy', tag: 'error' };
  if (value === 'degraded') return { color: status.warn, labelKey: 'overview.degraded', tag: 'warning' };
  return { color: status.ok, labelKey: 'overview.healthy', tag: 'success' };
}

function InstancePanel({ instances }) {
  const { t } = useTranslation();
  const unhealthy = instances.filter((item) => item.status === 'unhealthy').length;
  const degraded = instances.filter((item) => item.status === 'degraded').length;
  const podCount = instances.filter((item) => item.runtimeType === 'pod').length;
  const dockerCount = instances.filter((item) => item.runtimeType === 'docker').length;
  const bareCount = instances.filter((item) => item.runtimeType === 'bare').length;
  const columns = [
    {
      title: t('metrics.colInstanceName'),
      dataIndex: 'shortName',
      render: (value, instance) => {
        const meta = runtimeMeta(instance.runtimeType);
        return (
          <Space size={8}>
            <span style={{ color: meta.color }}>{meta.icon}</span>
            <span className="mono" style={{ fontSize: 12 }}>
              {value}
            </span>
          </Space>
        );
      },
    },
    {
      title: t('metrics.colRuntime'),
      dataIndex: 'runtimeType',
      render: (_, instance) => {
        const meta = runtimeMeta(instance.runtimeType);
        return (
          <Tag color={instance.runtimeType === 'pod' ? 'blue' : instance.runtimeType === 'docker' ? 'orange' : 'default'}>
            {t(meta.labelKey)}
          </Tag>
        );
      },
    },
    {
      title: t('metricsDemo.status'),
      dataIndex: 'status',
      render: (value) => {
        const meta = statusMeta(value);
        return (
          <Space size={7}>
            <span className="metrics-status-dot" style={{ color: meta.color }} />
            <Tag color={meta.tag} style={{ marginInlineEnd: 0 }}>
              {t(meta.labelKey)}
            </Tag>
          </Space>
        );
      },
    },
    { title: t('metrics.colRps'), dataIndex: 'rps', align: 'right', render: (value) => <span className="num">{value}</span> },
    {
      title: t('metrics.colErrorRate'),
      dataIndex: 'errorRate',
      align: 'right',
      render: (value) => (
        <span className="num" style={{ color: value > 0.05 ? status.error : value > 0.02 ? status.warn : neutral.text }}>
          {formatPercent(value)}
        </span>
      ),
    },
    {
      title: 'p99',
      dataIndex: 'p99',
      align: 'right',
      render: (value) => (
        <span className="num" style={{ color: value > 900 ? status.error : value > 500 ? status.warn : neutral.text }}>
          {value}ms
        </span>
      ),
    },
    {
      title: t('metricsDemo.resourceUsage'),
      key: 'resource',
      align: 'right',
      render: (_, instance) => (
        <span className="num">
          {instance.cpu}% / {instance.memory}%
        </span>
      ),
    },
  ];

  const expandedRowRender = (instance) => {
    const resourceAttrs = [
      ['Instance ID', instance.id],
      ['service.instance.id', instance.serviceInstanceId],
      ['Resource source', instance.source],
      ['host.name', instance.host],
      ['container.id', instance.containerId],
      ['container.image.name', instance.image],
      ['k8s.namespace.name', instance.namespace],
      ['k8s.pod.name', instance.podName],
      ['k8s.node.name', instance.nodeName],
      [t('metricsDemo.resourceNote'), t(instance.noteKey)],
    ];

    return (
      <div className="metrics-instance-expanded">
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, sm: 2, xl: 3 }}
          items={resourceAttrs.map(([label, value]) => ({
            key: label,
            label: <Text className="mono" type="secondary" style={{ fontSize: 11, wordBreak: 'break-all' }}>{label}</Text>,
            children: <Text className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{value}</Text>,
          }))}
        />
      </div>
    );
  };

  return (
    <Card className="metrics-demo-light-card" style={{ ...surfaceCardStyle, marginTop: 16 }} styles={{ body: { padding: 16 } }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <SectionTitle title={t('metrics.cardInstanceDetail')} desc={t('metricsDemo.instanceDescription')} />
        <Space size={8} wrap>
          <Tag color="blue">{podCount} Pod</Tag>
          <Tag color="orange">{dockerCount} Docker</Tag>
          <Tag>{bareCount} Bare Java</Tag>
          <Tag color={unhealthy ? 'error' : degraded ? 'warning' : 'success'}>
            {t('metricsDemo.healthSummary', { unhealthy, degraded })}
          </Tag>
        </Space>
      </div>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={instances}
        expandable={{
          defaultExpandedRowKeys: ['docker/order-compose-01'],
          expandedRowRender,
        }}
      />
    </Card>
  );
}

function KpiCard({ icon, label, value, suffix, tone, deltaValue, hint }) {
  const good = deltaValue <= 0 || label === 'RPS';
  return (
    <Card
      className="metrics-demo-kpi"
      style={{
        ...glassCardStyle,
        '--metric-glow': `${tone}33`,
      }}
      styles={{ body: { padding: 18 } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <Avatar
          icon={icon}
          style={{
            width: 34,
            height: 34,
            color: tone,
            background: `${tone}20`,
            border: `1px solid ${tone}40`,
            boxShadow: `0 0 22px ${tone}2E`,
          }}
        />
        <Tag
          color={good ? 'success' : 'warning'}
          style={{
            marginInlineEnd: 0,
            borderColor: good ? 'rgba(56, 217, 150, 0.42)' : 'rgba(242, 106, 27, 0.42)',
            background: good ? 'rgba(56, 217, 150, 0.14)' : 'rgba(242, 106, 27, 0.14)',
            color: good ? TECH.green : TECH.orange,
          }}
        >
          {deltaValue >= 0 ? '+' : ''}
          {(deltaValue * 100).toFixed(1)}%
        </Tag>
      </div>
      <Statistic
        title={<Text className="uppercase-label" style={{ color: TECH.textMuted }}>{label}</Text>}
        value={value}
        suffix={suffix}
        valueStyle={{ fontSize: 32, lineHeight: 1, fontWeight: 760, color: TECH.text }}
      />
      <Text style={{ display: 'block', fontSize: 12, marginTop: 10, color: TECH.textSecondary }}>
        {hint}
      </Text>
    </Card>
  );
}

function SectionTitle({ title, desc, dark = false, icon }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Space size={8} align="center">
        {icon && <span style={{ color: dark ? TECH.cyan : brand.primary }}>{icon}</span>}
        <Title level={5} style={{ margin: 0, color: dark ? TECH.text : neutral.heading }}>
          {title}
        </Title>
      </Space>
      {desc && (
        <Text style={{ display: 'block', fontSize: 12, color: dark ? TECH.textSecondary : neutral.textSecondary, marginTop: 3 }}>
          {desc}
        </Text>
      )}
    </div>
  );
}

export default function MetricsDemoPage() {
  const { tokens } = useThemeMode();
  const { t, i18n } = useTranslation();
  const [service, setService] = useState(SERVICES[0]);
  const [endpointMode, setEndpointMode] = useState('unhealthy');
  const current = latest();
  const base = previous();
  const unhealthyEndpoints = ENDPOINTS.filter((e) => e.errorRate > 0.02 || e.p99 > 800);
  const endpointRows = endpointMode === 'all' ? ENDPOINTS : unhealthyEndpoints;
  const errorTone = healthTone(current.errorRate, 0.015, 0.05);
  const p99Tone = healthTone(current.p99, 500, 900);

  const charts = useMemo(
    () => ({
      rate: buildLineChart({
        unit: 'req/s',
        fields: [{ name: 'RPS', key: 'requests', color: TECH.cyan, area: true }],
        dark: true,
      }),
      errors: buildLineChart({
        unit: '%',
        fields: [{ name: t('metrics.chartErrorRate'), key: 'errorRate', color: TECH.red, area: true }],
        threshold: { value: 0.05, label: 'SLO 5%' },
        dark: true,
      }),
      latency: buildLineChart({
        unit: 'ms',
        fields: [
          { name: 'p50', key: 'p50', color: TECH.green },
          { name: 'p90', key: 'p90', color: TECH.orange },
          { name: 'p99', key: 'p99', color: TECH.red, width: 2.5 },
        ],
        threshold: { value: 900, label: '900ms' },
        dark: true,
      }),
      heatmap: buildLatencyHeatmap(tokens),
    }),
    [i18n.language, t, tokens],
  );

  const endpointColumns = [
    {
      title: t('metrics.colOperation'),
      dataIndex: 'operation',
      render: (value, row) => (
        <Space direction="vertical" size={2}>
          <span className="mono" style={{ fontSize: 12, color: neutral.heading }}>
            {value}
          </span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t(row.trendKey)}
          </Text>
        </Space>
      ),
    },
    { title: t('metrics.colRequests'), dataIndex: 'requestCount', align: 'right', render: formatInt },
    { title: t('metrics.colRps'), dataIndex: 'rps', align: 'right', render: (v) => <span className="num">{v.toFixed(1)}</span> },
    { title: t('metricsDemo.errorCount'), dataIndex: 'errors', align: 'right', render: formatInt },
    {
      title: t('metrics.colErrorRate'),
      dataIndex: 'errorRate',
      align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.errorRate - b.errorRate,
      render: (v) => (
        <Tag color={v > 0.05 ? 'error' : v > 0.02 ? 'warning' : 'success'} style={{ marginInlineEnd: 0 }}>
          {formatPercent(v)}
        </Tag>
      ),
    },
    { title: 'p90', dataIndex: 'p90', align: 'right', render: (v) => <span className="num">{formatMs(v)}</span> },
    {
      title: 'p99',
      dataIndex: 'p99',
      align: 'right',
      sorter: (a, b) => a.p99 - b.p99,
      render: (v) => (
        <span className="num" style={{ color: v > 900 ? status.error : v > 500 ? status.warn : neutral.text }}>
          {formatMs(v)}
        </span>
      ),
    },
    {
      title: t('metrics.colDrilldown'),
      key: 'actions',
      align: 'right',
      render: () => (
        <Space size={6}>
          <Button size="small" icon={<PartitionOutlined />}>
            {t('traceDetail.trace')}
          </Button>
          <Button size="small" icon={<FireOutlined />}>
            {t('nav.logs')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="metrics-demo-shell">
      <TechStyles />

      <Card className="metrics-demo-hero" style={{ ...glassCardStyle, marginBottom: 16 }} styles={{ body: { padding: 20 } }}>
        <Flex justify="space-between" gap={16} wrap="wrap" align="flex-start" style={{ marginBottom: 18 }}>
          <div>
            <Space size={8} wrap style={{ marginBottom: 10 }}>
              <Tag color="processing" style={{ marginInlineEnd: 0 }}>
                {t('metricsDemo.tagDemo')}
              </Tag>
              <Tag color="warning" style={{ marginInlineEnd: 0 }}>
                {t('metricsDemo.tagIncident')}
              </Tag>
              <Tag style={{ marginInlineEnd: 0, color: TECH.textSecondary, borderColor: TECH.panelBorder, background: 'rgba(255,255,255,0.06)' }}>
                {t('metricsDemo.tagRange')}
              </Tag>
            </Space>
            <Title level={3} style={{ margin: 0, color: TECH.text, letterSpacing: -0.6 }}>
              {t('metricsDemo.title')}
            </Title>
            <Text style={{ display: 'block', color: TECH.textSecondary, marginTop: 7 }}>
              {t('metricsDemo.subtitle')}
            </Text>
          </div>
          <Space size={10} wrap>
            <ServiceBadge name={service} />
            <Tag color="success" style={{ marginInlineEnd: 0 }}>
              prod
            </Tag>
          </Space>
        </Flex>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12} xl={6}>
            <KpiCard
              icon={<ThunderboltOutlined />}
              label="RPS"
              value={formatNumber(current.requests)}
              suffix="req/s"
              tone={TECH.cyan}
              deltaValue={delta(current.requests, base.requests)}
              hint={t('metricsDemo.hintRequestRate')}
            />
          </Col>
          <Col xs={24} md={12} xl={6}>
            <KpiCard
              icon={<BugOutlined />}
              label={t('metrics.kErrorRate')}
              value={formatPercent(current.errorRate)}
              tone={errorTone}
              deltaValue={delta(current.errorRate, base.errorRate)}
              hint={t('metricsDemo.hintErrorRate')}
            />
          </Col>
          <Col xs={24} md={12} xl={6}>
            <KpiCard
              icon={<ClockCircleOutlined />}
              label={t('metrics.kP99')}
              value={formatInt(current.p99)}
              suffix="ms"
              tone={p99Tone}
              deltaValue={delta(current.p99, base.p99)}
              hint={t('metricsDemo.hintP99')}
            />
          </Col>
          <Col xs={24} md={12} xl={6}>
            <KpiCard
              icon={<ApartmentOutlined />}
              label={t('metricsDemo.activeInstances')}
              value="3 / 3"
              tone={TECH.green}
              deltaValue={0}
              hint={t('metricsDemo.hintActiveInstances')}
            />
          </Col>
        </Row>

        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: `1px solid ${TECH.panelBorder}`,
            borderRadius: 14,
            background: 'rgba(255,255,255,0.045)',
          }}
        >
          <Flex justify="space-between" gap={12} wrap="wrap" align="center">
            <Space size={8} wrap>
              <Text style={{ color: TECH.textSecondary, fontSize: 13 }}>{t('metrics.service')}</Text>
              <Select
                style={{ width: 240 }}
                value={service}
                options={SERVICES.map((name) => ({ value: name, label: <ServiceBadge name={name} /> }))}
                onChange={setService}
              />
              <Text style={{ color: TECH.textSecondary, fontSize: 13 }}>{t('metricsDemo.environment')}</Text>
              <Select style={{ width: 130 }} value="prod" options={ENVIRONMENTS.map((value) => ({ value }))} />
              <Text style={{ color: TECH.textSecondary, fontSize: 13 }}>{t('metrics.instance')}</Text>
              <Select
                style={{ width: 260 }}
                value="all"
                options={[
                  { value: 'all', label: t('metrics.allInstances') },
                  ...INSTANCES.map((instance) => ({ value: instance.id, label: instance.shortName })),
                ]}
              />
            </Space>
            <Text style={{ color: TECH.textMuted, fontSize: 12 }}>
              {t('metricsDemo.frontendOnly')}
            </Text>
          </Flex>
        </div>
      </Card>

      <Card className="metrics-demo-panel" style={{ ...glassCardStyle, marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
        <SectionTitle
          dark
          icon={<LineChartOutlined />}
          title={t('metrics.cardRedTrend')}
          desc={t('metricsDemo.redDescription')}
        />
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <div className="metrics-demo-mini-chart" style={{ padding: 12 }}>
              <Text style={{ color: TECH.text, fontWeight: 600 }}>{t('metrics.chartRequestRate')}</Text>
              <EChart option={charts.rate} height={230} />
            </div>
          </Col>
          <Col xs={24} lg={12}>
            <div className="metrics-demo-mini-chart" style={{ padding: 12 }}>
              <Text style={{ color: TECH.text, fontWeight: 600 }}>{t('metrics.chartErrorRate')}</Text>
              <EChart option={charts.errors} height={230} />
            </div>
          </Col>
          <Col xs={24}>
            <div className="metrics-demo-mini-chart" style={{ padding: 12 }}>
              <Text style={{ color: TECH.text, fontWeight: 600 }}>{t('metrics.chartLatencyPercentiles')}</Text>
              <EChart option={charts.latency} height={260} />
            </div>
          </Col>
        </Row>
      </Card>

      <Card className="metrics-demo-light-card" style={{ ...surfaceCardStyle, marginTop: 16 }} styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <SectionTitle title={t('metrics.cardEndpoints')} desc={t('metricsDemo.endpointDescription')} />
          <Segmented
            value={endpointMode}
            onChange={setEndpointMode}
            options={[
              { value: 'unhealthy', label: t('metrics.endpointModeUnhealthy') },
              { value: 'all', label: t('metrics.endpointModeAll') },
            ]}
          />
        </div>
        <Table rowKey="operation" size="small" pagination={false} columns={endpointColumns} dataSource={endpointRows} />
      </Card>

      <InstancePanel instances={INSTANCES} />

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={12}>
          <Card className="metrics-demo-light-card" style={surfaceCardStyle} styles={{ body: { padding: 16 } }}>
            <SectionTitle
              icon={<RadarChartOutlined />}
              title={t('metricsDemo.latencyDistribution')}
              desc={t('metricsDemo.latencyDescription')}
            />
            <EChart option={charts.heatmap} height={260} />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card className="metrics-demo-light-card" style={surfaceCardStyle} styles={{ body: { padding: 16 } }}>
            <SectionTitle title={t('metrics.cardJvm')} desc={t('metricsDemo.jvmDescription')} />
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {JVM.map((item) => (
                <div key={item.metric}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text>{item.metric}</Text>
                    <Text className="mono" type="secondary">
                      {item.detail}
                    </Text>
                  </div>
                  <Progress percent={item.value} strokeColor={item.tone} showInfo={false} />
                </div>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card className="metrics-demo-light-card" style={{ ...surfaceCardStyle, marginTop: 16 }} styles={{ body: { padding: 16 } }}>
        <SectionTitle title={t('metricsDemo.rawMetrics')} desc={t('metricsDemo.rawMetricsDescription')} />
        <Row gutter={[12, 12]}>
          {EXPLORER.map((metric) => (
            <Col xs={24} md={12} xl={6} key={metric.name}>
              <div
                style={{
                  border: `1px solid ${neutral.border}`,
                  borderRadius: 12,
                  padding: 14,
                  background: neutral.surfaceMuted,
                  minHeight: 112,
                }}
              >
                <Tag color={metric.type === 'histogram' ? 'orange' : metric.type === 'gauge' ? 'blue' : 'purple'}>
                  {metric.type}
                </Tag>
                <div className="mono truncate" style={{ marginTop: 10, fontSize: 12, color: neutral.heading }}>
                  {metric.name}
                </div>
                <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
                  {metric.series} series · last seen {metric.lastSeen}
                </Text>
              </div>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
}
