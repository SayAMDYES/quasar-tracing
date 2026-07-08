/**
 * Minimal data-fetching hook over the Axios API layer: tracks loading/error/data
 * and re-runs when `deps` change. Keeps pages free of repetitive effect plumbing.
 *
 * @author Quasar
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export default function useFetch(fn, deps = [], { immediate = true, backgroundKey } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const fnRef = useRef(fn);
  const backgroundKeyRef = useRef(backgroundKey);
  fnRef.current = fn;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      setData(result);
      return result;
    } catch (err) {
      setError(err);
      return undefined;
    } finally {
      if (!silent) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    const silent = backgroundKey !== undefined && backgroundKey !== backgroundKeyRef.current;
    backgroundKeyRef.current = backgroundKey;
    if (immediate) run({ silent });
  }, [run, immediate, backgroundKey]);

  const refetch = useCallback(() => run(), [run]);

  return { data, loading, error, refetch, setData };
}
