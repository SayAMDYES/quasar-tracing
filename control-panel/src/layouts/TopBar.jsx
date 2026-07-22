/**
 * Global top bar: a trace-id / operation quick search on the left and the
 * app-wide time-range control, language switch and refresh on the right. The time
 * range here drives every page that reads it via useApp().
 *
 * @author Quasar
 */
import { Input, Button, Dropdown, Popover, Tooltip } from 'antd';
import { DownOutlined, ReloadOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AUTO_REFRESH_OPTIONS, useApp } from '@/context/AppContext';
import TimeRangePicker from '@/components/TimeRangePicker';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeSwitcher from '@/components/ThemeSwitcher';

const TRACE_ID_RE = /^[0-9a-f]{32}$/i;

export default function TopBar() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    range,
    rangeKey,
    setRangeKey,
    setCustomRange,
    autoRefreshKey,
    autoRefreshRevision,
    setAutoRefreshKey,
    refreshRange,
  } = useApp();
  const [autoRefreshStarting, setAutoRefreshStarting] = useState(false);
  const [autoRefreshAnimating, setAutoRefreshAnimating] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const previousAutoRefreshKey = useRef(autoRefreshKey);
  const previousAutoRefreshRevision = useRef(autoRefreshRevision);
  const autoRefreshAnimationTimer = useRef(null);
  const autoRefreshOptions = AUTO_REFRESH_OPTIONS.map((option) => ({
    key: option.key,
    label: option.key === 'off' ? t('topbar.autoRefreshOffShort') : option.key,
  }));
  const autoRefreshEnabled = autoRefreshKey !== 'off';

  useEffect(() => {
    if (previousAutoRefreshKey.current === 'off' && autoRefreshEnabled) {
      setAutoRefreshStarting(true);
      const timer = window.setTimeout(() => setAutoRefreshStarting(false), 1200);
      previousAutoRefreshKey.current = autoRefreshKey;
      return () => window.clearTimeout(timer);
    }

    previousAutoRefreshKey.current = autoRefreshKey;
    return undefined;
  }, [autoRefreshEnabled, autoRefreshKey]);

  useEffect(() => () => {
    if (autoRefreshAnimationTimer.current) window.clearTimeout(autoRefreshAnimationTimer.current);
  }, []);

  const playAutoRefreshAnimation = () => {
    if (autoRefreshAnimationTimer.current) window.clearTimeout(autoRefreshAnimationTimer.current);
    setAutoRefreshAnimating(false);
    window.requestAnimationFrame(() => {
      setAutoRefreshAnimating(true);
      autoRefreshAnimationTimer.current = window.setTimeout(() => setAutoRefreshAnimating(false), 420);
    });
  };

  useEffect(() => {
    if (previousAutoRefreshRevision.current !== autoRefreshRevision) {
      previousAutoRefreshRevision.current = autoRefreshRevision;
      if (autoRefreshEnabled) playAutoRefreshAnimation();
    }
  }, [autoRefreshEnabled, autoRefreshRevision]);

  const onSearch = (value) => {
    const v = value.trim();
    if (!v) return;
    setMobileSearchOpen(false);
    if (TRACE_ID_RE.test(v)) navigate(`/traces/${v.toLowerCase()}`);
    else navigate(`/traces?q=${encodeURIComponent(v)}`);
  };

  return (
    <div className="topbar">
      <Input.Search
        allowClear
        placeholder={t('topbar.searchPlaceholder')}
        onSearch={onSearch}
        className="topbar-search"
      />
      <Popover
        trigger="click"
        placement="bottomLeft"
        open={mobileSearchOpen}
        onOpenChange={setMobileSearchOpen}
        overlayClassName="topbar-mobile-search-popover"
        content={(
          <Input.Search
            autoFocus
            allowClear
            placeholder={t('topbar.searchPlaceholder')}
            onSearch={onSearch}
            className="topbar-mobile-search-input"
          />
        )}
      >
        <Button
          className="topbar-mobile-search-button"
          aria-label={t('topbar.searchPlaceholder')}
          icon={<SearchOutlined />}
        />
      </Popover>
      <div className="topbar-actions">
        <TimeRangePicker value={rangeKey} range={range} onChange={setRangeKey} onCustomChange={setCustomRange} />
        <Dropdown
          trigger={['click']}
          menu={{
            selectedKeys: [autoRefreshKey],
            items: autoRefreshOptions,
            onClick: ({ key }) => setAutoRefreshKey(key),
          }}
        >
          <Button
            aria-label={t('topbar.autoRefresh')}
            className={[
              'auto-refresh-button',
              autoRefreshEnabled && 'is-on',
              autoRefreshStarting && 'is-starting',
              autoRefreshAnimating && 'is-refreshing',
            ].filter(Boolean).join(' ')}
            icon={<SyncOutlined />}
            title={autoRefreshEnabled ? t('topbar.autoRefreshEvery', { interval: autoRefreshKey }) : t('topbar.autoRefreshOff')}
          >
            <span className="auto-refresh-button-label">
              {autoRefreshKey === 'off' ? t('topbar.autoRefreshOffShort') : autoRefreshKey}
            </span>
            <DownOutlined className="auto-refresh-button-caret" />
          </Button>
        </Dropdown>
        <ThemeSwitcher />
        <LanguageSwitcher />
        <Tooltip title={t('common.refresh')}>
          <Button icon={<ReloadOutlined />} onClick={refreshRange} />
        </Tooltip>
      </div>
    </div>
  );
}
