"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import RoomShell from "@/components/room/room-shell";
import { normalizeSlugInput } from "@/lib/slug";

// A single static page. The room to open lives in the "r" query parameter
// (e.g. /r/?r=cocoa-willow-7fk2), so there are no unknown paths for a static
// host to 404 on -- every room resolves to this one file.
export default function RoomRoute() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-ink-950" />}>
      <RoomEntry />
    </Suspense>
  );
}

function RoomEntry() {
  const params = useSearchParams();
  const slug = normalizeSlugInput(params.get("r") ?? "");

  if (!slug) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink-950 px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-xl font-semibold">No room in the link.</h1>
          <p className="mt-2.5 text-sm leading-relaxed text-muted">
            This address is missing the part that says which nook to open.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-2xl bg-chalk px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-white"
          >
            go to the front door
          </Link>
        </div>
      </main>
    );
  }

  return <RoomShell slug={slug} initialRoom={null} />;
}
