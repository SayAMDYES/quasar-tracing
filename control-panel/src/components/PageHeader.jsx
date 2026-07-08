/**
 * Consistent page title block: optional back button, title, description and a
 * right-aligned actions slot. Used at the top of every page.
 *
 * @author Quasar
 */
import { Button, Space, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function PageHeader({ title, description, onBack, extra, tags, style }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 18,
        flexWrap: 'wrap',
        ...style,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Space size={10} align="center" style={{ marginBottom: description ? 2 : 0 }}>
          {onBack && (
            <Button
              type="text"
              size="small"
              icon={<ArrowLeftOutlined />}
              onClick={onBack}
              style={{ marginLeft: -6 }}
            />
          )}
          <Title level={4} style={{ margin: 0, fontWeight: 600 }}>
            {title}
          </Title>
          {tags}
        </Space>
        {description && (
          <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
            {description}
          </Text>
        )}
      </div>
      {extra && <Space wrap>{extra}</Space>}
    </div>
  );
}
