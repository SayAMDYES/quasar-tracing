/**
 * Compact app-header menu for system, light and dark theme preferences.
 *
 * @author Quasar
 */
import { Button, Dropdown, Tooltip } from 'antd';
import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '@/context/ThemeContext';

const ICONS = {
  system: <DesktopOutlined />,
  light: <SunOutlined />,
  dark: <MoonOutlined />,
};

export default function ThemeSwitcher() {
  const { t } = useTranslation();
  const { preference, setPreference } = useThemeMode();
  const items = ['system', 'light', 'dark'].map((key) => ({
    key,
    icon: ICONS[key],
    label: t(`theme.${key}`),
  }));

  return (
    <Dropdown
      trigger={['click']}
      menu={{ selectedKeys: [preference], items, onClick: ({ key }) => setPreference(key) }}
    >
      <Tooltip title={t('theme.label')}>
        <Button aria-label={t('theme.label')} icon={ICONS[preference]} />
      </Tooltip>
    </Dropdown>
  );
}
