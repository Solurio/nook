"use client";

import { Suspense, lazy, type ComponentType } from "react";

// Everything a room can show is split into its own file, so a room opens
// without first downloading thirty games. Then, while the room sits there
// idle, those files come down anyway, one after another, so that by the time
// somebody puts a game on the table -- or pans over to one -- it is already
// here and draws at once instead of showing "opening...".

type Module<P> = { default: ComponentType<P> };

/** Everything that can be fetched ahead of time, in the order it was declared. */
const queue: Array<() => Promise<unknown>> = [];

/**
 * A promise-like that hands over a value already in hand, synchronously. React
 * reads a lazy component's module through `then`; answering straight away
 * means no Suspense fallback at all for something already fetched.
 */
const settled = <T,>(value: T) => ({ then: (done: (v: T) => void) => done(value) }) as unknown as Promise<T>;

/**
 * A component loaded on first use, or earlier when preloadAll gets to it. The
 * same lazy component is used either way, so nothing remounts when the file
 * arrives; it only shows `fallback` while a file is genuinely on its way.
 */
export function preloadable<P extends object>(load: () => Promise<Module<P>>, Fallback?: ComponentType): ComponentType<P> {
  let ready: Module<P> | null = null;
  let pending: Promise<Module<P>> | null = null;
  const preload = () => {
    pending ??= load().then(
      (mod) => (ready = mod),
      (err) => {
        // A failed fetch (a deploy in between, a dropped connection) may be tried again.
        pending = null;
        throw err;
      },
    );
    return pending;
  };
  queue.push(() => preload().catch(() => undefined));

  const Lazy = lazy(() => (ready ? settled(ready) : preload()));
  function Preloadable(props: P) {
    return (
      <Suspense fallback={Fallback ? <Fallback /> : null}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  return Preloadable;
}

/** Other things worth having before they are asked for: a library, a file. */
export function preloadLater(task: () => Promise<unknown>) {
  queue.push(() => task().catch(() => undefined));
}

/** Whether this connection is one to spend on things nobody asked for yet. */
function roomToSpare(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData) return false;
  return !connection?.effectiveType || connection.effectiveType === "4g";
}

const idle = (work: () => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(work, { timeout: 2500 });
  else window.setTimeout(work, 200);
};

let started = false;

/**
 * Fetches everything queued, one file at a time, each when the browser is
 * idle. Files that queue more as they arrive (the game list queues every
 * game) are picked up too. Skipped on a data saver or a slow connection --
 * there, things load when they are first needed, as before.
 */
export function preloadAll() {
  if (started || typeof window === "undefined" || !roomToSpare()) return;
  started = true;
  let next = 0;
  const step = () => {
    if (next >= queue.length) return;
    const task = queue[next];
    next += 1;
    void task().then(() => idle(step));
  };
  idle(step);
}
