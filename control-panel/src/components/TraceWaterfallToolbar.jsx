/**
 * Controlled filters and navigation for the trace waterfall.
 *
 * @author Quasar
 */
import { Button, Input, Select, Switch, Tooltip } from 'antd';
import {
  DownOutlined,
  ReloadOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

export default function TraceWaterfallToolbar({
  query,
  onQueryChange,
  services,
  serviceOptions,
  onServicesChange,
  errorsOnly,
  onErrorsOnlyChange,
  criticalPathVisible,
  onCriticalPathVisibleChange,
  matchIndex,
  matchCount,
  onPreviousMatch,
  onNextMatch,
  onReset,
}) {
  const { t } = useTranslation();
  const hasMatches = matchCount > 0;
  const matchLabel = hasMatches
    ? t('traceDetail.matchCount', {
      current: Math.max(0, Math.min(matchCount, matchIndex + 1)),
      total: matchCount,
    })
    : t('traceDetail.noMatches');

  return (
    <div className="wf-toolbar">
      <Input
        className="wf-toolbar-search"
        allowClear
        value={query}
        placeholder={t('traceDetail.searchSpans')}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <Select
        className="wf-toolbar-services"
        mode="multiple"
        allowClear
        maxTagCount="responsive"
        value={services}
        options={serviceOptions}
        placeholder={t('traceDetail.serviceFilter')}
        onChange={onServicesChange}
      />
      <div className="wf-toolbar-toggle">
        <Switch
          size="small"
          checked={errorsOnly}
          aria-label={t('traceDetail.errorsOnly')}
          onChange={onErrorsOnlyChange}
        />
        <span>{t('traceDetail.errorsOnly')}</span>
      </div>
      <div className="wf-toolbar-toggle">
        <Switch
          size="small"
          checked={criticalPathVisible}
          aria-label={t('traceDetail.criticalPath')}
          onChange={onCriticalPathVisibleChange}
        />
        <span>{t('traceDetail.criticalPath')}</span>
      </div>
      <div className="wf-toolbar-match" aria-live="polite">
        <span className="wf-match-count">{matchLabel}</span>
        <Tooltip title={t('traceDetail.previousMatch')}>
          <Button
            type="text"
            size="small"
            icon={<UpOutlined />}
            aria-label={t('traceDetail.previousMatch')}
            disabled={!hasMatches}
            onClick={onPreviousMatch}
          />
        </Tooltip>
        <Tooltip title={t('traceDetail.nextMatch')}>
          <Button
            type="text"
            size="small"
            icon={<DownOutlined />}
            aria-label={t('traceDetail.nextMatch')}
            disabled={!hasMatches}
            onClick={onNextMatch}
          />
        </Tooltip>
        <Tooltip title={t('traceDetail.resetView')}>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            aria-label={t('traceDetail.resetView')}
            onClick={onReset}
          />
        </Tooltip>
      </div>
    </div>
  );
}
