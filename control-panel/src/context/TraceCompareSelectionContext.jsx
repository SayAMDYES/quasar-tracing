/**
 * Current-tab Trace Compare selection shared by Search and Detail.
 *
 * @author Quasar
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { parseTraceSourceRef } from '@/utils/traceSourceRef';

const TraceCompareSelectionContext = createContext(null);

function normalizeRefs(refs) {
  return [...new Set(refs)].filter((ref) => parseTraceSourceRef(ref)).slice(0, 2);
}

export function TraceCompareSelectionProvider({ children }) {
  const [selectedRefs, setSelectedRefsState] = useState([]);
  const setSelectedRefs = useCallback((refs) => setSelectedRefsState(normalizeRefs(refs)), []);
  const setBaseline = useCallback((ref) => setSelectedRefsState(
    parseTraceSourceRef(ref) ? [ref] : [],
  ), []);
  const clear = useCallback(() => setSelectedRefsState([]), []);
  const value = useMemo(() => ({
    selectedRefs,
    setSelectedRefs,
    setBaseline,
    clear,
  }), [clear, selectedRefs, setBaseline, setSelectedRefs]);
  return (
    <TraceCompareSelectionContext.Provider value={value}>
      {children}
    </TraceCompareSelectionContext.Provider>
  );
}

export function useTraceCompareSelection() {
  const context = useContext(TraceCompareSelectionContext);
  if (!context) throw new Error('useTraceCompareSelection must be used within TraceCompareSelectionProvider');
  return context;
}
