import { Suspense } from "react";
import Landing from "@/components/landing";
import { Localized } from "@/components/localized";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-ink-950" />}>
      <Localized>
        <Landing />
      </Localized>
    </Suspense>
  );
}
