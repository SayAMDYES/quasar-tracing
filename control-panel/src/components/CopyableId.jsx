/**
 * Monospace trace/span id with one-click copy. Optionally truncates the display
 * while always copying (and optionally linking) the full value.
 *
 * @author Quasar
 */
import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { shortId } from '@/utils/format';

const { Text } = Typography;

export default function CopyableId({ value, short = false, head = 12, onClick, style }) {
  const { t } = useTranslation();
  const display = short ? shortId(value, head) : value;
  return (
    <Text
      className="mono"
      copyable={{ text: value, tooltips: [t('common.copy'), t('common.copied')] }}
      style={{ fontSize: 12, color: 'var(--text-secondary)', ...style }}
    >
      {onClick ? (
        <a
          onClick={(e) => {
            e.stopPropagation();
            onClick(value);
          }}
          style={{ color: 'var(--brand-strong)' }}
        >
          {display}
        </a>
      ) : (
        display
      )}
    </Text>
  );
}
