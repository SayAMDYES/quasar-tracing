/**
 * Resolves live and archive API traces without fallback.
 *
 * @author Quasar
 */
import useFetch from '@/hooks/useFetch';
import { fetchTrace, fetchTraceLogs } from '@/api';

export default function useTraceSource({ liveTraceId, serverSource = 'auto' }) {
  const liveTrace = useFetch(
    () => fetchTrace(liveTraceId, serverSource),
    [liveTraceId, serverSource],
  );
  const liveLogs = useFetch(
    () => fetchTraceLogs(liveTraceId),
    [liveTraceId, serverSource],
    { immediate: serverSource !== 'archive' },
  );

  return {
    source: liveTrace.data?.summary?.source || 'live',
    traceId: liveTraceId,
    data: liveTrace.data,
    logs: liveLogs.data || [],
    loading: liveTrace.loading,
    error: liveTrace.error,
    refetch: liveTrace.refetch,
  };
}
