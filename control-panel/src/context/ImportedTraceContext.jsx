/**
 * React boundary for current-tab imported Trace sessions.
 *
 * @author Quasar
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createImportedTraceRepository } from '@/utils/importedTraceRepository';

const ImportedTraceContext = createContext(null);

export function ImportedTraceProvider({ children }) {
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) repositoryRef.current = createImportedTraceRepository();
  const [revision, setRevision] = useState(0);

  const addImport = useCallback((report, metadata) => {
    const sessionId = repositoryRef.current.add(report, metadata);
    setRevision((value) => value + 1);
    return sessionId;
  }, []);
  const removeImport = useCallback((sessionId) => {
    const removed = repositoryRef.current.remove(sessionId);
    if (removed) setRevision((value) => value + 1);
    return removed;
  }, []);
  const value = useMemo(() => ({
    addImport,
    removeImport,
    getSession: (sessionId) => repositoryRef.current.getSession(sessionId),
    getTrace: (sessionId, traceId) => repositoryRef.current.getTrace(sessionId, traceId),
  }), [addImport, removeImport, revision]);

  return <ImportedTraceContext.Provider value={value}>{children}</ImportedTraceContext.Provider>;
}

export function useImportedTraces() {
  const context = useContext(ImportedTraceContext);
  if (!context) throw new Error('useImportedTraces must be used within ImportedTraceProvider');
  return context;
}
