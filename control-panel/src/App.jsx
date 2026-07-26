/**
 * Route table. All pages render inside the AppLayout shell.
 *
 * @author Quasar
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '@/layouts/AppLayout';
import OverviewPage from '@/pages/Overview/OverviewPage';
import TraceSearchPage from '@/pages/TraceSearch/TraceSearchPage';
import TraceDetailPage from '@/pages/TraceDetail/TraceDetailPage';
import ServiceMapPage from '@/pages/ServiceMap/ServiceMapPage';
import LogSearchPage from '@/pages/LogSearch/LogSearchPage';
import MetricsPage from '@/pages/Metrics/MetricsPage';
import TraceComparePage from '@/pages/TraceCompare/TraceComparePage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/traces" element={<TraceSearchPage />} />
        <Route path="/traces/compare" element={<TraceComparePage />} />
        <Route path="/traces/:traceId" element={<TraceDetailPage />} />
        <Route path="/services" element={<ServiceMapPage />} />
        <Route path="/logs" element={<LogSearchPage />} />
        <Route path="/metrics" element={<MetricsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
