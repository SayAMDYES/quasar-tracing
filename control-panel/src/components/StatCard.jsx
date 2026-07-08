/**
 * KPI card: label, large value, optional delta indicator and a tiny sparkline.
 * Reused on the Overview and Metrics pages.
 *
 * @author Quasar
 */
import { Card, Tooltip } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import EChart from './EChart';
import { brand, status } from '@/theme/tokens';

function Sparkline({ data, color }) {
  const option = {
    grid: { left: 0, right: 0, top: 4, bottom: 0 },
    xAxis: { type: 'category', show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', show: false, scale: true },
    tooltip: { show: false },
    series: [
      {
        type: 'line',
        animationDuration: 700,
        animationDurationUpdate: 350,
        animationEasing: 'cubicOut',
        animationEasingUpdate: 'cubicInOut',
        data,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}33` },
              { offset: 1, color: `${color}00` },
            ],
          },
        },
      },
    ],
  };
  return <EChart option={option} height={40} />;
}

export default function StatCard({
  label,
  value,
  suffix,
  tone = brand.primary,
  delta,
  deltaGood,
  spark,
  hint,
}) {
  const deltaColor = delta == null ? undefined : deltaGood ? status.ok : status.error;
  const DeltaIcon = delta >= 0 ? ArrowUpOutlined : ArrowDownOutlined;

  return (
    <Card size="small" styles={{ body: { padding: '14px 16px' } }} style={{ height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="uppercase-label">{label}</span>
        {hint && (
          <Tooltip title={hint}>
            <span className="muted" style={{ fontSize: 12, cursor: 'help' }}>
              ⓘ
            </span>
          </Tooltip>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
        <span
          className="num"
          style={{ fontSize: 26, fontWeight: 600, color: 'var(--heading)', lineHeight: 1.1 }}
        >
          {value}
        </span>
        {suffix && (
          <span className="muted" style={{ fontSize: 13 }}>
            {suffix}
          </span>
        )}
        {delta != null && (
          <span
            className="num"
            style={{ marginLeft: 'auto', color: deltaColor, fontSize: 12, fontWeight: 600 }}
          >
            <DeltaIcon style={{ fontSize: 10 }} /> {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      {spark && spark.length > 1 && (
        <div style={{ marginTop: 8 }}>
          <Sparkline data={spark} color={tone} />
        </div>
      )}
    </Card>
  );
}
