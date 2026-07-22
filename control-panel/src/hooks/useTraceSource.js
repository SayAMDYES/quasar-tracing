/**
 * Resolves live API traces and current-tab imported Trace Documents without fallback.
 *
 * @author Quasar
 */
import { useMemo } from 'react';
import useFetch from '@/hooks/useFetch';
import { fetchTrace, fetchTraceLogs } from '@/api';
import { useImportedTraces } from '@/context/ImportedTraceContext';
import { traceDocumentToDetail } from '@/utils/importedTraceRepository';

function sourceError(code) {
  return Object.assign(new Error(code), { code });
}

export default function useTraceSource({ liveTraceId, importedSessionId, importedTraceId, serverSource = 'auto' }) {
  const imported = useImportedTraces();
  const isImported = Boolean(importedSessionId);
  const liveTrace = useFetch(
    () => fetchTrace(liveTraceId, serverSource),
    [liveTraceId, serverSource],
    { immediate: !isImported },
  );
  const liveLogs = useFetch(
    () => fetchTraceLogs(liveTraceId),
    [liveTraceId, serverSource],
    { immediate: !isImported && serverSource !== 'archive' },
  );
  const session = isImported ? imported.getSession(importedSessionId) : null;
  const resolvedTraceId = isImported
    ? importedTraceId || session?.primaryTraceId || ''
    : liveTraceId;
  const document = isImported && session
    ? imported.getTrace(importedSessionId, resolvedTraceId)
    : null;
  const importedError = useMemo(() => {
    if (!isImported) return null;
    if (!session) return sourceError('IMPORTED_SESSION_EXPIRED');
    if (!document) return sourceError('IMPORTED_TRACE_NOT_FOUND');
    return null;
  }, [document, isImported, session]);

  if (isImported) {
    return {
      source: 'imported',
      traceId: resolvedTraceId,
      session,
      document,
      data: document ? traceDocumentToDetail(document) : null,
      logs: [],
      loading: false,
      error: importedError,
      refetch: undefined,
    };
  }
  return {
    source: liveTrace.data?.summary?.source || 'live',
    traceId: liveTraceId,
    session: null,
    document: null,
    data: liveTrace.data,
    logs: liveLogs.data || [],
    loading: liveTrace.loading,
    error: liveTrace.error,
    refetch: liveTrace.refetch,
  };
}
