/**
 * Sidebar navigation menu driven by the NAV model. Highlights the active route,
 * matching nested paths (e.g. /traces/:id highlights "Traces"). Labels are
 * resolved through i18n so the menu localizes.
 *
 * @author Quasar
 */
import { Menu } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NAV, NAV_ITEMS } from '@/router/nav';

function toMenuItems(nav, t) {
  return nav.map((node) =>
    node.type === 'group'
      ? {
          type: 'group',
          label: t(node.groupKey),
          children: node.children.map((c) => ({ key: c.key, icon: c.icon, label: t(c.labelKey) })),
        }
      : { key: node.key, icon: node.icon, label: t(node.labelKey) },
  );
}

export default function SideNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const selected =
    NAV_ITEMS.map((i) => i.key)
      .filter((key) => (key === '/' ? location.pathname === '/' : location.pathname.startsWith(key)))
      .sort((a, b) => b.length - a.length)[0] || '/';

  return (
    <Menu
      mode="inline"
      selectedKeys={[selected]}
      items={toMenuItems(NAV, t)}
      onClick={({ key }) => navigate(key)}
      style={{ borderInlineEnd: 'none', padding: '6px 4px' }}
    />
  );
}
