"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Fixed-interval throttle that also delivers the final call of a burst, so a
 * drag never ends on a stale position. All the bookkeeping lives inside the
 * returned callback, which keeps it out of render.
 */
export function useThrottled<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  const latest = useRef(fn);
  const lastRun = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);

  useEffect(() => {
    latest.current = fn;
  });

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return useCallback(
    (...args: T) => {
      const now = Date.now();
      const wait = ms - (now - lastRun.current);

      if (wait <= 0) {
        lastRun.current = now;
        latest.current(...args);
        return;
      }

      pending.current = args;
      if (timer.current) return;

      timer.current = setTimeout(() => {
        timer.current = null;
        lastRun.current = Date.now();
        const args2 = pending.current;
        pending.current = null;
        if (args2) latest.current(...args2);
      }, wait);
    },
    [ms],
  );
}
