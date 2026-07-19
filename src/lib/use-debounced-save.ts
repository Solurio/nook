"use client";

import { useEffect, useRef } from "react";

/**
 * Debounced writer for text that people type into shared items. Keeps the
 * database quiet during a burst of keystrokes but still flushes on unmount so
 * nothing is lost when a note is deselected or the tab closes.
 */
export function useDebouncedSave<T>(save: (value: T) => void | Promise<void>, delay = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);
  const saveRef = useRef(save);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current !== null) void saveRef.current(pending.current);
    };
  }, []);

  return {
    queue(value: T) {
      pending.current = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        const next = pending.current;
        pending.current = null;
        if (next !== null) void saveRef.current(next);
      }, delay);
    },
    flush() {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const next = pending.current;
      pending.current = null;
      if (next !== null) void saveRef.current(next);
    },
  };
}
