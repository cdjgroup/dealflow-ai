"use client";

import { useSyncExternalStore, useCallback, useMemo } from "react";

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  // Stable JSON string of the initial value — used as fallback in snapshots.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialJson = useMemo(() => JSON.stringify(initialValue), []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handler = (e: StorageEvent) => {
        if (e.key === key) onStoreChange();
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
    [key]
  );

  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key) ?? initialJson;
    } catch {
      return initialJson;
    }
  }, [key, initialJson]);

  const getServerSnapshot = useCallback(() => initialJson, [initialJson]);

  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const parsed = useMemo<T>(() => {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return JSON.parse(initialJson) as T;
    }
  }, [raw, initialJson]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const currentRaw = window.localStorage.getItem(key);
        const current: T = currentRaw
          ? (JSON.parse(currentRaw) as T)
          : (JSON.parse(initialJson) as T);
        const nextValue =
          value instanceof Function ? value(current) : value;
        window.localStorage.setItem(key, JSON.stringify(nextValue));
        window.dispatchEvent(
          new StorageEvent("storage", { key, storageArea: window.localStorage })
        );
      } catch {
        // Storage full or parsing error — fail silently
      }
    },
    [key, initialJson]
  );

  return [parsed, setValue];
}
