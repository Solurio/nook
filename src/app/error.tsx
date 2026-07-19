"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-ink-950 px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-xl font-semibold">Something came loose.</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          {error.message || "An unexpected error, which is not very helpful of it."}
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-2xl bg-chalk px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-white"
          >
            try again
          </button>
          <Link
            href="/"
            className="rounded-2xl bg-white/7 px-5 py-2.5 text-sm font-medium text-muted ring-1 ring-white/10 transition hover:bg-white/11 hover:text-chalk"
          >
            go home
          </Link>
        </div>
      </div>
    </main>
  );
}
