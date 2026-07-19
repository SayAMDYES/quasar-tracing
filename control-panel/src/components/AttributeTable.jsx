/**
 * Renders an attribute map (OTel resource/span/log attributes) as a compact
 * two-column key/value list with monospace values. Reused in the span and log
 * detail drawers and the service panel.
 *
 * @author Quasar
 */
import { Button, Descriptions, Space, Tooltip, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export default function AttributeTable({ data, emptyText = '—', onFilterAttribute }) {
  const { t } = useTranslation();
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
        children: onFilterAttribute ? (
          <Space size={4} align="start">
            <Text className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
              {String(value)}
            </Text>
            <Tooltip title={t('common.filterByAttribute')}>
              <Button
                type="text"
                size="small"
                icon={<SearchOutlined />}
                aria-label={t('common.filterByAttributeAria', { key })}
                onClick={(event) => {
                  event.stopPropagation();
                  onFilterAttribute(key, String(value));
                }}
              />
            </Tooltip>
          </Space>
        ) : (
          <Text className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
            {String(value)}
          </Text>
        ),
      }))}
    />
  );
}
