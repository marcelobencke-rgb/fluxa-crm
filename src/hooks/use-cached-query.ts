"use client";

import { useEffect, useState } from "react";

/**
 * A lightweight global promise cache to avoid duplicate fetches
 * across components mounted at the same time (e.g. settings panels).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, { data: any; timestamp: number }>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inflight = new Map<string, Promise<any>>();

const STALE_TIME = 5 * 60 * 1000; // 5 minutes

export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dependencies: any[] = []
): { data: T | null; loading: boolean; error: Error | null; mutate: (data: T) => void } {
  const [data, setData] = useState<T | null>(() => {
    if (!key) return null;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < STALE_TIME) {
      return cached.data;
    }
    return null;
  });
  
  const [loading, setLoading] = useState<boolean>(!data && !!key);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!key) return;

    let cancelled = false;

    // Check cache again in effect (might have been populated by another component)
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < STALE_TIME) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Dedup inflight requests
    let promise = inflight.get(key);
    if (!promise) {
      promise = fetcher();
      inflight.set(key, promise);
    }

    promise
      .then((res) => {
        if (cancelled) return;
        cache.set(key, { data: res, timestamp: Date.now() });
        setData(res);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        // Only the first component to resolve it should clear the inflight map
        if (inflight.get(key) === promise) {
          inflight.delete(key);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...dependencies]);

  const mutate = (newData: T) => {
    if (!key) return;
    cache.set(key, { data: newData, timestamp: Date.now() });
    setData(newData);
  };

  return { data, loading, error, mutate };
}
