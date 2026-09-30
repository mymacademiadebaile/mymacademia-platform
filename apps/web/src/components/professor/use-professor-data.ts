"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiMessage } from "@/lib/api";

/**
 * Stale-while-revalidate fetch for the professor portal.
 * `loading` is true only for the very first load of a path; later refetches keep the
 * previous data visible and only flip `refreshing`. Returning to a path already loaded
 * shows its cached data immediately while it revalidates.
 */
const cache = new Map<string, unknown>();

export function useProfessorData<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(
    path ? (cache.get(path) as T | undefined) : undefined
  );
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const activePath = useRef(path);
  activePath.current = path;

  const load = useCallback(async () => {
    if (!path) return;
    setRefreshing(true);
    try {
      const result = await apiFetch<T>(`/professor${path}`);
      cache.set(path, result);
      if (activePath.current === path) {
        setData(result);
        setError("");
      }
    } catch (requestError) {
      if (activePath.current === path) setError(apiMessage(requestError));
    } finally {
      if (activePath.current === path) setRefreshing(false);
    }
  }, [path]);

  useEffect(() => {
    setData(path ? (cache.get(path) as T | undefined) : undefined);
    setError("");
    void load();
  }, [path, load]);

  /** Local update that also refreshes the cache entry (e.g. optimistic attendance). */
  const mutate = useCallback(
    (updater: (current: T) => T) => {
      setData((current) => {
        if (current === undefined) return current;
        const next = updater(current);
        if (path) cache.set(path, next);
        return next;
      });
    },
    [path]
  );

  return {
    data,
    error,
    /** True only until the first data (or error) for this path arrives. */
    loading: data === undefined && !error,
    /** True while revalidating; data stays on screen. */
    refreshing,
    reload: load,
    mutate
  };
}

/** Drops cached entries so the next visit refetches (e.g. after changing attendance). */
export function invalidateProfessorData(prefix = "") {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
