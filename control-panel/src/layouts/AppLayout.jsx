/**
 * Application shell: collapsible white sidebar (brand + nav), sticky top bar,
 * and the scrollable content region that hosts the routed pages.
 *
 * @author Quasar
 */
import { useState } from 'react';
import { Grid, Layout } from 'antd';
import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SideNav from './SideNav';
import TopBar from './TopBar';
import { APP_VERSION } from '@/config/version';

const { Sider, Header, Content, Footer } = Layout;
const { useBreakpoint } = Grid;

function Brand({ collapsed }) {
  const { t } = useTranslation();

  return (
    <Link
      to="/"
      aria-label={t('app.backToOverview')}
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: collapsed ? '0 0 0 18px' : '0 16px',
        borderBottom: '1px solid var(--border)',
        color: 'inherit',
        textDecoration: 'none',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: 'var(--brand-primary)',
          color: '#fff',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 28px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        Q
      </span>
      {!collapsed && (
        <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--heading)', whiteSpace: 'nowrap' }}>
          Quasar <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Tracing</span>
        </span>
      )}
    </Link>
  );
}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const screens = useBreakpoint();
  const isNarrow = screens.xs && !screens.md;
  const effectiveCollapsed = isNarrow || collapsed;

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider
        theme="light"
        width={232}
        collapsedWidth={64}
        collapsible
        collapsed={effectiveCollapsed}
        onCollapse={setCollapsed}
        style={{ borderRight: '1px solid var(--border)' }}
      >
        <Brand collapsed={effectiveCollapsed} />
        <SideNav />
      </Sider>
      <Layout style={{ minWidth: 0 }}>
        <Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <TopBar />
        </Header>
        <Content style={{ overflow: 'auto', minWidth: 0 }}>
          <div className="app-content">
            <Outlet />
          </div>
          <Footer className="app-footer">
            <span>© 2026 Quasar Tracing</span>
            <span className="app-footer-dot" />
            <span className="mono">v{APP_VERSION}</span>
          </Footer>
        </Content>
      </Layout>
    </Layout>
  );
}
