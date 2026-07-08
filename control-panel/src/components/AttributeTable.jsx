/**
 * Renders an attribute map (OTel resource/span/log attributes) as a compact
 * two-column key/value list with monospace values. Reused in the span and log
 * detail drawers and the service panel.
 *
 * @author Quasar
 */
import { Descriptions, Typography } from 'antd';

const { Text } = Typography;

export default function AttributeTable({ data, emptyText = '—' }) {
  const entries = Object.entries(data || {}).filter(([, v]) => v != null && v !== '');
  if (!entries.length) return <Text type="secondary">{emptyText}</Text>;

  return (
    <Descriptions
      bordered
      size="small"
      column={1}
      items={entries.map(([key, value]) => ({
        key,
        label: <Text className="mono" type="secondary" style={{ fontSize: 12, wordBreak: 'break-all' }}>{key}</Text>,
        children: <Text className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{String(value)}</Text>,
      }))}
    />
  );
}
