"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  loadLocalIdentity,
  randomName,
  randomTint,
  rememberRoom,
  saveLocalIdentity,
} from "@/lib/identity";
import { newId } from "@/lib/slug";
import { useThrottled } from "@/lib/use-throttled";
import type { ItemDraft } from "@/lib/items";
import { useRoomStore, viewportForItems } from "@/state/room-store";
import type {
  AnyItem,
  Background,
  DoodleStroke,
  Identity,
  ItemDataMap,
  ItemKind,
  InkDraft,
  Message,
  Peer,
  Room,
  Stroke,
  TransformPatch,
} from "@/lib/types";
import type { Signal } from "@/lib/webrtc";

export interface Ping {
  id: string;
  x: number;
  y: number;
  glyph: string;
  tint: string;
}

interface RoomApi {
  status: "loading" | "ready" | "error";
  error: string | null;
  canEdit: boolean;
  isOwner: boolean;

  /** True once the visitor has picked a name and stepped into the room. */
  joined: boolean;
  join: (name: string, tint: string) => void;

  createItem: (draft: ItemDraft) => Promise<AnyItem | null>;
  duplicateItem: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  commitTransform: (patch: TransformPatch) => Promise<void>;
  broadcastTransform: (patch: TransformPatch) => void;
  updateData: <K extends ItemKind>(id: string, data: ItemDataMap[K]) => Promise<void>;
  bringToFront: (id: string) => Promise<void>;

  updateBackground: (background: Background) => Promise<void>;
  renameRoom: (name: string) => Promise<void>;
  setLocked: (locked: boolean) => Promise<void>;

  sendMessage: (body: string) => Promise<void>;
  uploadFile: (file: File) => Promise<string | null>;

  moveCursor: (x: number, y: number) => void;
  sendPing: (x: number, y: number, glyph: string) => void;
  pings: Ping[];

  broadcastStroke: (itemId: string, stroke: DoodleStroke) => void;
  liveStrokes: Record<string, DoodleStroke[]>;

  createStroke: (color: string, size: number, points: number[]) => Promise<void>;
  eraseStroke: (id: string) => Promise<void>;
  broadcastInk: (draft: InkDraft | null) => void;

  startCobrowse: (url: string) => Promise<CobrowseResult>;
  stopCobrowse: (sessionId: string) => Promise<void>;

  /** WebRTC signalling for the live screen share, over the room channel. */
  sendSignal: (signal: Signal) => void;
  onSignal: (handler: (signal: Signal) => void) => () => void;

  updateIdentity: (patch: Partial<Pick<Identity, "name" | "tint">>) => void;
}

export type CobrowseResult =
  | { ok: true; embedUrl: string; sessionId: string }
  | { ok: false; error: "not_configured" | "unauthorized" | "failed"; detail?: string };

const RoomContext = createContext<RoomApi | null>(null);

export function useRoom(): RoomApi {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoom must be used inside <RoomProvider>");
  return ctx;
}

const CURSOR_INTERVAL_MS = 45;
const TRANSFORM_INTERVAL_MS = 33;
const PING_LIFETIME_MS = 1800;

export function RoomProvider({
  slug,
  initialRoom,
  children,
}: {
  slug: string;
  initialRoom: Room | null;
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const store = useRoomStore;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [pings, setPings] = useState<Ping[]>([]);
  const [liveStrokes, setLiveStrokes] = useState<Record<string, DoodleStroke[]>>({});

  const channelRef = useRef<RealtimeChannel | null>(null);
  const identityRef = useRef<Identity | null>(null);
  const roomIdRef = useRef<string | null>(initialRoom?.id ?? null);
  // Live WebRTC signalling listeners (screen share). Kept in a ref so the boot
  // effect wires them once while components come and go.
  const signalHandlers = useRef(new Set<(signal: Signal) => void>());
  // Presence is only announced after the visitor steps through the door.
  const joinedRef = useRef(false);

  const room = useRoomStore((s) => s.room);
  const me = useRoomStore((s) => s.me);

  const isOwner = Boolean(room && me && room.owner_id === me.userId);
  const canEdit = Boolean(room && (!room.locked || isOwner));

  // The page is statically exported with a generic title, so the room's name
  // is set on the tab here, client-side, once it (or a rename) loads.
  useEffect(() => {
    if (room?.name) document.title = `${room.name} — nook`;
  }, [room?.name]);

  const pushPing = useCallback((ping: Ping) => {
    setPings((current) => [...current, ping]);
    setTimeout(() => {
      setPings((current) => current.filter((p) => p.id !== ping.id));
    }, PING_LIFETIME_MS);
  }, []);

  const broadcast = useCallback((event: string, payload: unknown) => {
    const channel = channelRef.current;
    if (!channel) return;
    channel.send({ type: "broadcast", event, payload });
  }, []);

  // -------------------------------------------------------------------------
  // Boot: sign in anonymously, load the room, wire realtime.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        store.getState().setConnection("connecting");

        const {
          data: { session },
        } = await supabase.auth.getSession();

        let userId = session?.user?.id ?? null;
        if (!userId) {
          const { data, error: authError } = await supabase.auth.signInAnonymously();
          if (authError) throw authError;
          userId = data.user?.id ?? null;
        }
        if (!userId) throw new Error("Could not start a session.");
        if (cancelled) return;

        const saved = loadLocalIdentity();
        const identity: Identity = {
          userId,
          name: saved?.name ?? randomName(),
          tint: saved?.tint ?? randomTint(),
        };
        if (!saved) saveLocalIdentity({ name: identity.name, tint: identity.tint });
        identityRef.current = identity;
        store.getState().setMe(identity);

        const { data: roomRow, error: roomError } = await supabase
          .from("rooms")
          .select("*")
          .eq("slug", slug)
          .maybeSingle();

        if (roomError) throw roomError;
        if (!roomRow) throw new Error("That nook does not exist (or was taken down).");
        if (cancelled) return;

        const loadedRoom = roomRow as Room;
        roomIdRef.current = loadedRoom.id;
        store.getState().setRoom(loadedRoom);
        rememberRoom(loadedRoom.slug, loadedRoom.name);

        const [itemsResult, messagesResult, strokesResult] = await Promise.all([
          supabase.from("items").select("*").eq("room_id", loadedRoom.id),
          supabase
            .from("messages")
            .select("*")
            .eq("room_id", loadedRoom.id)
            .order("created_at", { ascending: false })
            .limit(80),
          supabase
            .from("strokes")
            .select("*")
            .eq("room_id", loadedRoom.id)
            .order("created_at", { ascending: true })
            .limit(1500),
        ]);

        if (cancelled) return;

        // Open your console (F12) to see exactly what the room returned.
        console.log("Itens vindos do Supabase:", itemsResult.data);
        if (itemsResult.error) {
          // A failed items read should not blank the whole room -- load the
          // chrome + realtime anyway so items can still stream in live.
          console.error("[nook] failed to load items", itemsResult.error);
        }

        const loadedItems = (itemsResult.data ?? []) as AnyItem[];
        store.getState().hydrateItems(loadedItems);
        store
          .getState()
          .hydrateMessages(((messagesResult.data ?? []) as Message[]).slice().reverse());
        store.getState().hydrateStrokes((strokesResult.data ?? []) as Stroke[]);

        // Point the camera at the content on entry. Without this the room opens
        // at (0,0) and looks empty whenever the wall was built far from origin.
        if (loadedItems.length > 0 && typeof window !== "undefined") {
          store
            .getState()
            .setViewport(viewportForItems(loadedItems, window.innerWidth, window.innerHeight));
        }

        // Realtime needs the fresh access token before it will honour RLS.
        const {
          data: { session: liveSession },
        } = await supabase.auth.getSession();
        if (liveSession?.access_token) {
          await supabase.realtime.setAuth(liveSession.access_token);
        }

        const channel = supabase.channel(`room:${loadedRoom.id}`, {
          config: {
            presence: { key: userId },
            broadcast: { self: false },
          },
        });

        channel
          .on("presence", { event: "sync" }, () => {
            const raw = channel.presenceState<Peer>();
            const peers: Peer[] = [];
            for (const entries of Object.values(raw)) {
              const entry = entries[entries.length - 1];
              if (entry && entry.userId) peers.push(entry);
            }
            store.getState().syncPeers(peers);
          })
          .on("broadcast", { event: "cursor" }, ({ payload }) => {
            const { userId: from, x, y } = payload as { userId: string; x: number; y: number };
            store.getState().setPeerCursor(from, { x, y });
          })
          .on("broadcast", { event: "transform" }, ({ payload }) => {
            store.getState().applyTransform(payload as TransformPatch);
          })
          .on("broadcast", { event: "ping" }, ({ payload }) => {
            const p = payload as Omit<Ping, "id">;
            pushPing({ ...p, id: newId() });
          })
          .on("broadcast", { event: "stroke" }, ({ payload }) => {
            const { itemId, stroke } = payload as { itemId: string; stroke: DoodleStroke };
            setLiveStrokes((current) => {
              const existing = current[itemId] ?? [];
              const index = existing.findIndex((s) => s.id === stroke.id);
              const next = index >= 0 ? existing.slice() : [...existing, stroke];
              if (index >= 0) next[index] = stroke;
              return { ...current, [itemId]: next };
            });
          })
          .on("broadcast", { event: "ink" }, ({ payload }) => {
            const { userId: from, draft } = payload as {
              userId: string;
              draft: InkDraft | null;
            };
            store.getState().setLiveInk(from, draft);
          })
          .on("broadcast", { event: "rtc" }, ({ payload }) => {
            const signal = payload as Signal;
            signalHandlers.current.forEach((handler) => handler(signal));
          })
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "items", filter: `room_id=eq.${loadedRoom.id}` },
            (payload) => {
              if (payload.eventType === "DELETE") {
                const old = payload.old as { id?: string };
                if (old?.id) {
                  store.getState().removeItem(old.id);
                  setLiveStrokes((current) => {
                    if (!(old.id! in current)) return current;
                    const next = { ...current };
                    delete next[old.id!];
                    return next;
                  });
                }
                return;
              }
              const item = payload.new as AnyItem;
              store.getState().upsertItem(item);
              // The committed row now contains these strokes; drop the local echo.
              if (item.kind === "game") {
                setLiveStrokes((current) =>
                  item.id in current ? { ...current, [item.id]: [] } : current,
                );
              }
            },
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "strokes",
              filter: `room_id=eq.${loadedRoom.id}`,
            },
            (payload) => {
              if (payload.eventType === "DELETE") {
                const old = payload.old as { id?: string };
                if (old?.id) store.getState().removeStroke(old.id);
                return;
              }
              store.getState().upsertStroke(payload.new as Stroke);
            },
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${loadedRoom.id}` },
            (payload) => {
              store.getState().patchRoom(payload.new as Room);
            },
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `room_id=eq.${loadedRoom.id}`,
            },
            (payload) => {
              store.getState().appendMessage(payload.new as Message);
            },
          )
          .subscribe(async (state) => {
            if (state === "SUBSCRIBED") {
              store.getState().setConnection("live");
              // Only announce presence once the visitor has actually entered;
              // before that they are loading the room but not "here" yet.
              const current = identityRef.current;
              if (current && joinedRef.current) {
                await channel.track({ ...current, joinedAt: Date.now() } satisfies Peer);
              }
            } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
              store.getState().setConnection("offline");
            }
          });

        channelRef.current = channel;
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Something went wrong loading this nook.");
        setStatus("error");
        store.getState().setConnection("offline");
      }
    }

    boot();

    return () => {
      cancelled = true;
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) supabase.removeChannel(channel);
    };
  }, [slug, supabase, store, pushPing]);

  // -------------------------------------------------------------------------
  // Ephemeral effects
  // -------------------------------------------------------------------------

  const emitCursor = useCallback(
    (x: number, y: number) => {
      const identity = identityRef.current;
      if (!identity) return;
      broadcast("cursor", { userId: identity.userId, x, y });
    },
    [broadcast],
  );

  const emitTransform = useCallback(
    (patch: TransformPatch) => {
      broadcast("transform", patch);
    },
    [broadcast],
  );

  const moveCursor = useThrottled(emitCursor, CURSOR_INTERVAL_MS);
  const broadcastTransform = useThrottled(emitTransform, TRANSFORM_INTERVAL_MS);

  const sendPing = useCallback(
    (x: number, y: number, glyph: string) => {
      const identity = identityRef.current;
      if (!identity) return;
      broadcast("ping", { x, y, glyph, tint: identity.tint });
      pushPing({ id: newId(), x, y, glyph, tint: identity.tint });
    },
    [broadcast, pushPing],
  );

  const broadcastStroke = useCallback(
    (itemId: string, stroke: DoodleStroke) => {
      broadcast("stroke", { itemId, stroke });
    },
    [broadcast],
  );

  // -------------------------------------------------------------------------
  // Durable mutations. Everything here writes to Postgres and lets
  // postgres_changes do the fan-out, so late joiners never miss anything.
  // -------------------------------------------------------------------------

  const createItem = useCallback(
    async (draft: ItemDraft): Promise<AnyItem | null> => {
      const roomId = roomIdRef.current;
      const identity = identityRef.current;
      if (!roomId || !identity) return null;

      const { data, error: insertError } = await supabase
        .from("items")
        .insert({ ...draft, room_id: roomId, created_by: identity.userId })
        .select()
        .single();

      if (insertError) {
        setError(insertError.message);
        return null;
      }

      const item = data as AnyItem;
      store.getState().upsertItem(item);
      store.getState().select(item.id);
      return item;
    },
    [supabase, store],
  );

  const duplicateItem = useCallback(
    async (id: string) => {
      const source = store.getState().items[id];
      if (!source) return;
      const items = Object.values(store.getState().items);
      const z = items.reduce((max, item) => Math.max(max, item.z), 0) + 1;

      await createItem({
        kind: source.kind,
        x: source.x + 28,
        y: source.y + 28,
        width: source.width,
        height: source.height,
        rotation: source.rotation,
        z,
        data: source.data,
      });
    },
    [createItem, store],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      store.getState().removeItem(id);
      const { error: deleteError } = await supabase.from("items").delete().eq("id", id);
      if (deleteError) setError(deleteError.message);
    },
    [supabase, store],
  );

  const commitTransform = useCallback(
    async (patch: TransformPatch) => {
      const { error: updateError } = await supabase
        .from("items")
        .update({
          x: patch.x,
          y: patch.y,
          width: patch.width,
          height: patch.height,
          rotation: patch.rotation,
        })
        .eq("id", patch.id);
      if (updateError) setError(updateError.message);
    },
    [supabase],
  );

  const updateData = useCallback(
    async <K extends ItemKind>(id: string, data: ItemDataMap[K]) => {
      store.getState().patchItemData(id, data as Record<string, unknown>);
      const { error: updateError } = await supabase.from("items").update({ data }).eq("id", id);
      if (updateError) setError(updateError.message);
    },
    [supabase, store],
  );

  const bringToFront = useCallback(
    async (id: string) => {
      const items = Object.values(store.getState().items);
      const target = items.find((item) => item.id === id);
      if (!target) return;
      const top = items.reduce((max, item) => Math.max(max, item.z), 0);
      if (target.z === top && items.length > 1) return;

      const z = top + 1;
      store.getState().upsertItem({ ...target, z });
      const { error: updateError } = await supabase.from("items").update({ z }).eq("id", id);
      if (updateError) setError(updateError.message);
    },
    [supabase, store],
  );

  const updateBackground = useCallback(
    async (background: Background) => {
      const roomId = roomIdRef.current;
      if (!roomId) return;
      store.getState().setBackground(background);
      const { error: updateError } = await supabase
        .from("rooms")
        .update({ background })
        .eq("id", roomId);
      if (updateError) setError(updateError.message);
    },
    [supabase, store],
  );

  const renameRoom = useCallback(
    async (name: string) => {
      const roomId = roomIdRef.current;
      if (!roomId) return;
      const trimmed = name.trim().slice(0, 80) || "untitled nook";
      store.getState().patchRoom({ name: trimmed });
      const { error: updateError } = await supabase
        .from("rooms")
        .update({ name: trimmed })
        .eq("id", roomId);
      if (updateError) setError(updateError.message);
    },
    [supabase, store],
  );

  const setLocked = useCallback(
    async (locked: boolean) => {
      const roomId = roomIdRef.current;
      if (!roomId) return;
      store.getState().patchRoom({ locked });
      const { error: updateError } = await supabase
        .from("rooms")
        .update({ locked })
        .eq("id", roomId);
      if (updateError) setError(updateError.message);
    },
    [supabase, store],
  );

  const sendMessage = useCallback(
    async (body: string) => {
      const roomId = roomIdRef.current;
      const identity = identityRef.current;
      const trimmed = body.trim();
      if (!roomId || !identity || !trimmed) return;

      const { data, error: insertError } = await supabase
        .from("messages")
        .insert({
          room_id: roomId,
          author_id: identity.userId,
          author_name: identity.name,
          author_tint: identity.tint,
          body: trimmed.slice(0, 2000),
        })
        .select()
        .single();

      if (insertError) {
        setError(insertError.message);
        return;
      }
      store.getState().appendMessage(data as Message);
    },
    [supabase, store],
  );

  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      const roomId = roomIdRef.current;
      if (!roomId) return null;

      const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const path = `${roomId}/${newId()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("decorations")
        .upload(path, file, { cacheControl: "31536000", upsert: false });

      if (uploadError) {
        setError(uploadError.message);
        return null;
      }

      const { data } = supabase.storage.from("decorations").getPublicUrl(path);
      return data.publicUrl;
    },
    [supabase],
  );

  const updateIdentity = useCallback(
    (patch: Partial<Pick<Identity, "name" | "tint">>) => {
      const current = identityRef.current;
      if (!current) return;

      const next: Identity = { ...current, ...patch };
      identityRef.current = next;
      store.getState().setMe(next);
      saveLocalIdentity({ name: next.name, tint: next.tint });
      if (joinedRef.current) {
        void channelRef.current?.track({ ...next, joinedAt: Date.now() } satisfies Peer);
      }
    },
    [store],
  );

  const join = useCallback(
    (name: string, tint: string) => {
      const current = identityRef.current;
      if (!current) return;

      const trimmed = name.trim().slice(0, 32) || current.name;
      const next: Identity = { ...current, name: trimmed, tint };
      identityRef.current = next;
      store.getState().setMe(next);
      saveLocalIdentity({ name: next.name, tint: next.tint });

      joinedRef.current = true;
      setJoined(true);
      // The channel may already be subscribed; announce presence now.
      void channelRef.current?.track({ ...next, joinedAt: Date.now() } satisfies Peer);
    },
    [store],
  );

  // -------------------------------------------------------------------------
  // Room ink
  // -------------------------------------------------------------------------

  const createStroke = useCallback(
    async (color: string, size: number, points: number[]) => {
      const roomId = roomIdRef.current;
      const identity = identityRef.current;
      if (!roomId || !identity || points.length < 2) return;

      const { data, error: insertError } = await supabase
        .from("strokes")
        .insert({ room_id: roomId, color, size, points, created_by: identity.userId })
        .select()
        .single();

      // Clear our own broadcast draft regardless; the row (or nothing) replaces it.
      store.getState().setLiveInk(identity.userId, null);

      if (insertError) {
        setError(insertError.message);
        return;
      }
      store.getState().upsertStroke(data as Stroke);
    },
    [supabase, store],
  );

  const eraseStroke = useCallback(
    async (id: string) => {
      if (!store.getState().strokes[id]) return;
      store.getState().removeStroke(id);
      const { error: deleteError } = await supabase.from("strokes").delete().eq("id", id);
      if (deleteError) setError(deleteError.message);
    },
    [supabase, store],
  );

  const broadcastInk = useCallback(
    (draft: InkDraft | null) => {
      const identity = identityRef.current;
      if (!identity) return;
      // Mirror locally so our own in-flight line shows without a round trip.
      store.getState().setLiveInk(identity.userId, draft);
      broadcast("ink", { userId: identity.userId, draft });
    },
    [broadcast, store],
  );

  // -------------------------------------------------------------------------
  // Co-browse: ask the serverless function to spin up a shared cloud browser.
  // The Hyperbeam key lives only in that function, never here.
  // -------------------------------------------------------------------------

  const startCobrowse = useCallback(
    async (url: string): Promise<CobrowseResult> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      try {
        const res = await fetch("/api/cobrowse", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, token: session?.access_token }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          embedUrl?: string;
          sessionId?: string;
          error?: string;
          detail?: string;
          status?: number;
        };

        if (res.ok && data.embedUrl && data.sessionId) {
          return { ok: true, embedUrl: data.embedUrl, sessionId: data.sessionId };
        }
        if (data.error === "not_configured") return { ok: false, error: "not_configured" };
        if (res.status === 401) return { ok: false, error: "unauthorized" };
        return {
          ok: false,
          error: "failed",
          detail: data.detail || (data.status ? `Hyperbeam ${data.status}` : undefined),
        };
      } catch {
        return { ok: false, error: "failed" };
      }
    },
    [supabase],
  );

  const stopCobrowse = useCallback(async (sessionId: string) => {
    try {
      await fetch(`/api/cobrowse?session_id=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
    } catch {
      // The offline timeout will reap the session even if this never lands.
    }
  }, []);

  const sendSignal = useCallback(
    (signal: Signal) => {
      broadcast("rtc", signal);
    },
    [broadcast],
  );

  const onSignal = useCallback((handler: (signal: Signal) => void) => {
    signalHandlers.current.add(handler);
    return () => {
      signalHandlers.current.delete(handler);
    };
  }, []);

  const value: RoomApi = {
    status,
    error,
    canEdit,
    isOwner,
    joined,
    join,
    createItem,
    duplicateItem,
    deleteItem,
    commitTransform,
    broadcastTransform,
    updateData,
    bringToFront,
    updateBackground,
    renameRoom,
    setLocked,
    sendMessage,
    uploadFile,
    moveCursor,
    sendPing,
    pings,
    broadcastStroke,
    liveStrokes,
    createStroke,
    eraseStroke,
    broadcastInk,
    startCobrowse,
    stopCobrowse,
    sendSignal,
    onSignal,
    updateIdentity,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
