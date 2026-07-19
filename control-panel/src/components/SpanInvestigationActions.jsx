/**
 * Presentational links for continuing an investigation from one Span. Target
 * paths and disabled reasons are resolved by the owning page.
 *
 * @author Quasar
 */
import {
  ApartmentOutlined,
  FileSearchOutlined,
  LineChartOutlined,
  PartitionOutlined,
} from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

const ACTIONS = [
  { key: 'logs', labelKey: 'span.investigation.spanLogs', icon: FileSearchOutlined },
  { key: 'metrics', labelKey: 'span.investigation.serviceMetrics', icon: LineChartOutlined },
  { key: 'topology', labelKey: 'span.investigation.locateTopology', icon: ApartmentOutlined },
  { key: 'similarTraces', labelKey: 'span.investigation.similarTraces', icon: PartitionOutlined },
];

export default function SpanInvestigationActions({ actions, onNavigate }) {
  const { t } = useTranslation();

  return (
    <div
      className="span-investigation-actions"
      role="group"
      aria-label={t('span.investigation.groupLabel')}
    >
      {ACTIONS.map(({ key, labelKey, icon: Icon }) => {
        const action = actions?.[key];
        const path = action?.path || null;
        const disabledReason = path
          ? null
          : action?.disabledReason || t('span.investigation.unavailable');
        const label = t(labelKey);

        return (
          <Tooltip key={key} title={disabledReason}>
            <span
              className="span-investigation-action"
              tabIndex={path ? undefined : 0}
              aria-label={path ? undefined : `${label}: ${disabledReason}`}
            >
              <Button
                size="small"
                icon={<Icon />}
                href={path || undefined}
                disabled={!path}
                aria-label={label}
                onClick={(event) => {
                  if (!path) {
                    event.preventDefault();
                    return;
                  }
                  if (!onNavigate
                    || event.button !== 0
                    || event.metaKey
                    || event.ctrlKey
                    || event.shiftKey
                    || event.altKey) {
                    return;
                  }
                  event.preventDefault();
                  onNavigate(path);
                }}
              >
                {label}
              </Button>
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}
