/**
 * Makes a valid investigation range effective during render, then synchronizes
 * it to the global picker without delaying the page's first request.
 *
 * @author Quasar
 */
import { useEffect, useMemo, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import {
  clampInvestigationRange,
  readInvestigationRange,
} from '@/utils/investigationContext';

export default function useInvestigationRange(searchParams) {
  const { range, setCustomRange } = useApp();
  const consumedKeyRef = useRef(null);
  const searchParamsString = searchParams.toString();
  const urlRange = useMemo(() => {
    const parsedRange = readInvestigationRange(new URLSearchParams(searchParamsString));
    return clampInvestigationRange(parsedRange);
  }, [searchParamsString]);
  const urlFrom = urlRange?.from;
  const urlTo = urlRange?.to;
  const urlRangeKey = urlRange ? `${urlFrom}:${urlTo}` : null;
  const shouldConsumeUrlRange = urlRangeKey !== null
    && consumedKeyRef.current !== urlRangeKey;

  useEffect(() => {
    if (urlRangeKey === null) {
      consumedKeyRef.current = null;
      return;
    }
    if (consumedKeyRef.current === urlRangeKey) return;

    consumedKeyRef.current = urlRangeKey;
    if (range.from === urlFrom && range.to === urlTo) return;
    setCustomRange(urlFrom, urlTo);
    // setCustomRange follows the current AppContext render; primitives control synchronization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlRangeKey, urlFrom, urlTo, range.from, range.to]);

  return shouldConsumeUrlRange ? urlRange : range;
}
