import { Suspense } from "react";
import Landing from "@/components/landing";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-ink-950" />}>
      <Landing />
    </Suspense>
  );
}
