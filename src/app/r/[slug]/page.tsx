import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import RoomShell from "@/components/room/room-shell";
import type { Room } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

async function fetchRoom(slug: string): Promise<Room | null> {
  const supabase = supabaseServer();
  if (!supabase) return null;

  const { data } = await supabase.from("rooms").select("*").eq("slug", slug).maybeSingle();
  return (data as Room) ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const room = await fetchRoom(slug);
  const name = room?.name ?? "a nook";

  return {
    title: `${name} — nook`,
    description: "Come hang out. Everything in here is shared, live.",
    openGraph: {
      title: `${name} — nook`,
      description: "Come hang out. Everything in here is shared, live.",
    },
  };
}

export default async function RoomPage({ params }: PageProps) {
  const { slug } = await params;
  const room = await fetchRoom(slug);

  return <RoomShell slug={slug} initialRoom={room} />;
}
