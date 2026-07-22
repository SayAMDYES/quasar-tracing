/**
 * Navigation model — the single source of truth for the sidebar and route
 * highlighting. Routes themselves are declared in src/App.jsx.
 *
 * @author Quasar
 */
import {
  DashboardOutlined,
  PartitionOutlined,
  ApartmentOutlined,
  FileSearchOutlined,
  ImportOutlined,
  LineChartOutlined,
} from '@ant-design/icons';

export const NAV = [
  { type: 'item', key: '/', labelKey: 'nav.overview', icon: <DashboardOutlined /> },
  {
    type: 'group',
    groupKey: 'nav.explore',
    children: [
      { key: '/traces', labelKey: 'nav.traces', icon: <PartitionOutlined /> },
      { key: '/traces/import', labelKey: 'nav.traceImport', icon: <ImportOutlined /> },
      { key: '/services', labelKey: 'nav.serviceMap', icon: <ApartmentOutlined /> },
      { key: '/logs', labelKey: 'nav.logs', icon: <FileSearchOutlined /> },
    ],
  },
  {
    type: 'group',
    groupKey: 'nav.monitor',
    children: [
      { key: '/metrics', labelKey: 'nav.metrics', icon: <LineChartOutlined /> },
    ],
  },
];

/** Flattened list of leaf nav items (no groups). */
export const NAV_ITEMS = NAV.flatMap((n) => (n.type === 'group' ? n.children : [n]));
