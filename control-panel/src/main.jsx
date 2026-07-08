/**
 * Application bootstrap: initializes i18n, wires the Ant Design theme/locale,
 * router and global app context, then mounts the app. Data comes from the real
 * platform API via the Vite /api proxy.
 *
 * @author Quasar
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import { useTranslation } from 'react-i18next';
import i18n, { normalizeLang } from '@/i18n';
import { antdTheme } from '@/theme/antdTheme';
import { AppProvider } from '@/context/AppContext';
import App from './App';
import './styles/global.css';

const ANTD_LOCALES = { en: enUS, 'zh-CN': zhCN };

// Keeps the Ant Design locale (pagination, table, empty states, …) in sync with i18n.
function Root() {
  const { i18n: instance } = useTranslation();
  const locale = ANTD_LOCALES[normalizeLang(instance.language)];
  return (
    <ConfigProvider theme={antdTheme} locale={locale}>
      <AntApp>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppProvider>
            <App />
          </AppProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);

// Touch i18n so the singleton is initialized before first paint.
void i18n;
