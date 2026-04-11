import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Like useState but persists the value in localStorage keyed by user ID + page key.
 */
export function usePersistedFilter<T>(pageKey: string, filterKey: string, defaultValue: T): [T, (value: T) => void] {
  const { user } = useAuth();
  const storageKey = `filter_${user?.id || "anon"}_${pageKey}_${filterKey}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) return JSON.parse(stored) as T;
    } catch {}
    return defaultValue;
  });

  const setAndPersist = useCallback((newValue: T) => {
    setValue(newValue);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newValue));
    } catch {}
  }, [storageKey]);

  return [value, setAndPersist];
}
