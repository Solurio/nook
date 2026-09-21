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
import { keepItemFlags, relayer, type ItemDraft, type Layering } from "@/lib/items";
import { explainPileError, keepTableState, type PileFn } from "@/lib/piles";
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
  /** Who dropped it. A reaction nobody can attribute is only decoration. */
  by: string;
}

interface RoomApi {
  status: "loading" | "ready" | "error";
  error: string | null;
  clearError: () => void;
  /** Puts a line in the toast, for problems that are not a failed write. */
  setNotice: (message: string) => void;
  canEdit: boolean;
  isOwner: boolean;

  /** True once the visitor has picked a name and stepped into the room. */
  joined: boolean;
  join: (name: string, tint: string) => void;

  createItem: (draft: ItemDraft) => Promise<AnyItem | null>;
  duplicateItem: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  commitTransform: (patch: TransformPatch) => Promise<void>;
  broadcastTransform: (patch: TransformPatch | TransformPatch[]) => void;
  updateData: <K extends ItemKind>(id: string, data: ItemDataMap[K]) => Promise<void>;
  /**
   * Calls one of the secret pile functions. Pass the new public state as
   * p_public and it shows locally straight away, the way updateData does; if
   * the database refuses the move, the item is read back so nothing is left
   * showing that did not happen.
   */
  pile: <T = unknown>(
    fn: PileFn,
    args: Record<string, unknown>,
    options?: { quiet?: boolean },
  ) => Promise<{ data: T | null; error: string | null }>;
  /** This visitor's own piles for an item. Row level security returns nothing else. */
  readPiles: (itemId: string) => Promise<Record<string, unknown[]>>;
  /** Move an item through the stack: to the front, the back, or one step either way. */
  restack: (id: string, where: Layering) => Promise<void>;

  updateBackground: (background: Background) => Promise<void>;
  renameRoom: (name: string) => Promise<void>;
  /** Owner only. Removes the room and everything in it. */
  deleteRoom: () => Promise<boolean>;
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

// Realtime is billed by the message, each one counted again for every screen
// it reaches, so the throwaway traffic is kept as thin as it can be while
// still looking live: cursors a little over eight times a second (the remote
// cursor glides between them), drags about fourteen, ink about eleven.
const CURSOR_INTERVAL_MS = 120;
const TRANSFORM_INTERVAL_MS = 70;
const INK_INTERVAL_MS = 90;
const PING_LIFETIME_MS = 1800;

/** Matches the storage bucket's own limit, so the message beats the error. */
const MAX_UPLOAD_MB = 50;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

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

  /**
   * For the traffic that only matters to someone watching -- cursors, drags,
   * ink in progress. With nobody else in the room it goes nowhere and would
   * still be counted, so it is not sent at all.
   */
  const ephemeral = useCallback(
    (event: string, payload: unknown) => {
      const mine = identityRef.current?.userId;
      const company = Object.keys(store.getState().peers).some((id) => id !== mine);
      if (!company) return;
      broadcast(event, payload);
    },
    [broadcast, store],
  );

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
            // Several at once when a bundle of tied things is dragged.
            const batch = (payload as { patches?: TransformPatch[] }).patches ?? [payload as TransformPatch];
            for (const patch of batch) store.getState().applyTransform(patch);
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

  const lastCursor = useRef({ x: Number.NaN, y: Number.NaN });
  const emitCursor = useCallback(
    (x: number, y: number) => {
      const identity = identityRef.current;
      if (!identity) return;
      if (typeof document !== "undefined" && document.hidden) return;
      // A hand resting on the mouse still twitches; that is not worth a message.
      const last = lastCursor.current;
      if (Math.abs(last.x - x) < 3 && Math.abs(last.y - y) < 3) return;
      lastCursor.current = { x, y };
      ephemeral("cursor", { userId: identity.userId, x, y });
    },
    [ephemeral],
  );

  const emitTransform = useCallback(
    (patch: TransformPatch | TransformPatch[]) => {
      // A bundle of tied things goes as one message, not one per thing.
      ephemeral("transform", { patches: Array.isArray(patch) ? patch : [patch] });
    },
    [ephemeral],
  );

  const moveCursor = useThrottled(emitCursor, CURSOR_INTERVAL_MS);
  const broadcastTransform = useThrottled(emitTransform, TRANSFORM_INTERVAL_MS);

  const sendPing = useCallback(
    (x: number, y: number, glyph: string) => {
      const identity = identityRef.current;
      if (!identity) return;
      ephemeral("ping", { x, y, glyph, tint: identity.tint, by: identity.name });
      pushPing({ id: newId(), x, y, glyph, tint: identity.tint, by: identity.name });
    },
    [ephemeral, pushPing],
  );

  const broadcastStroke = useCallback(
    (itemId: string, stroke: DoodleStroke) => {
      ephemeral("stroke", { itemId, stroke });
    },
    [ephemeral],
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

  const clearError = useCallback(() => setError(null), []);
  const setNotice = useCallback((message: string) => setError(message), []);

  const deleteRoom = useCallback(async (): Promise<boolean> => {
    const roomId = roomIdRef.current;
    if (!roomId) return false;
    // Items, messages and strokes all hang off the room with cascade deletes,
    // so the one row takes the whole place with it.
    const { error: deleteError } = await supabase.from("rooms").delete().eq("id", roomId);
    if (deleteError) {
      setError(deleteError.message);
      return false;
    }
    return true;
  }, [supabase]);

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
        // A copy starts out on its own rather than tied to whatever the
        // original was tied to.
        data: { ...source.data, group: undefined },
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
    async <K extends ItemKind>(id: string, sent: ItemDataMap[K]) => {
      // A pin or a link the save knows nothing about stays where it was.
      const data = keepItemFlags(store.getState().items[id]?.data, sent);
      // Pile sizes and whatever has been turned over belong to the database,
      // which keeps them whatever a save says (see 0006_tabletop.sql). Kept
      // here too, so they do not blink out until the saved row comes back.
      const liveState = (store.getState().items[id]?.data as { state?: unknown } | undefined)?.state;
      const nextState = (data as { state?: unknown }).state;
      const local = liveState && nextState ? { ...data, state: keepTableState(liveState, nextState) } : data;
      store.getState().patchItemData(id, local as unknown as Record<string, unknown>);
      const { error: updateError } = await supabase.from("items").update({ data }).eq("id", id);
      if (updateError) setError(updateError.message);
    },
    [supabase, store],
  );

  const pile = useCallback(
    async <T,>(fn: PileFn, args: Record<string, unknown>, options?: { quiet?: boolean }) => {
      const itemId = args.p_item as string | undefined;
      const sentPublic = args.p_public as Record<string, unknown> | undefined;
      // The public state replaces the item's data whole: keep its pin and its links.
      const nextPublic = sentPublic && itemId ? keepItemFlags(store.getState().items[itemId]?.data, sentPublic) : sentPublic;
      if (nextPublic && nextPublic !== sentPublic) args = { ...args, p_public: nextPublic };

      if (itemId && nextPublic) {
        const live = store.getState().items[itemId];
        if (live) {
          // Keep the pile sizes we have until the database sends the real ones.
          const liveState = (live.data as { state?: Record<string, unknown> }).state ?? {};
          const state = (nextPublic.state as Record<string, unknown> | undefined) ?? {};
          store.getState().upsertItem({
            ...live,
            data: {
              ...nextPublic,
              state: { ...state, piles: liveState.piles, revealed: state.revealed ?? liveState.revealed },
            } as unknown as AnyItem["data"],
          });
        }
      }

      const { data, error: rpcError } = await supabase.rpc(fn, args);
      if (rpcError) {
        // Some refusals are expected -- two phones racing to turn the same
        // votes over, and the second finding them already turned. Those are
        // not worth a toast.
        if (!options?.quiet) setError(explainPileError(rpcError.message));
        if (itemId) {
          const { data: row } = await supabase.from("items").select("*").eq("id", itemId).maybeSingle();
          if (row) store.getState().upsertItem(row as AnyItem);
        }
        return { data: null, error: rpcError.message };
      }
      // These write the item several times in one go -- once per pile turned
      // over, then the sizes -- and the last of those echoes can arrive out of
      // step or not at all. One read settles it.
      if (itemId && (fn === "pile_reveal" || fn === "pile_setup")) {
        const { data: row } = await supabase.from("items").select("*").eq("id", itemId).maybeSingle();
        if (row) store.getState().upsertItem(row as AnyItem);
      }
      return { data: (data as T) ?? null, error: null };
    },
    [supabase, store],
  );

  const readPiles = useCallback(
    async (itemId: string) => {
      const { data, error: readError } = await supabase
        .from("secrets")
        .select("slot, cards")
        .eq("item_id", itemId);
      if (readError) return {};
      return Object.fromEntries(
        ((data ?? []) as Array<{ slot: string; cards: unknown[] }>).map((row) => [row.slot, row.cards]),
      );
    },
    [supabase],
  );

  const restack = useCallback(
    async (id: string, where: Layering) => {
      const moves = relayer(Object.values(store.getState().items), id, where);
      if (moves.length === 0) return;

      // Show it straight away; the rows catch up.
      for (const move of moves) {
        const live = store.getState().items[move.id];
        if (live) store.getState().upsertItem({ ...live, z: move.z });
      }

      const results = await Promise.all(
        moves.map((move) => supabase.from("items").update({ z: move.z }).eq("id", move.id)),
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) setError(failed.error.message);
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

      // Storage refuses anything past this, and a raw server error is a poor
      // way to find that out. Photos are shrunk before they get here; a long
      // video is the one that actually runs into it.
      if (file.size > MAX_UPLOAD_BYTES) {
        const mb = Math.round(file.size / 1048576);
        setError(
          `that one is ${mb}MB, and uploads stop at ${MAX_UPLOAD_MB}MB. a shorter clip, or a smaller export, will go up fine.`,
        );
        return null;
      }

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

  const inkLast = useRef(0);
  const inkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inkPending = useRef<InkDraft | null>(null);
  const broadcastInk = useCallback(
    (draft: InkDraft | null) => {
      const identity = identityRef.current;
      if (!identity) return;
      // Mirror locally so our own in-flight line shows without a round trip.
      store.getState().setLiveInk(identity.userId, draft);
      const send = (d: InkDraft | null) => ephemeral("ink", { userId: identity.userId, draft: d });
      // The end of a line goes at once, and nothing queued may land after it.
      if (!draft) {
        if (inkTimer.current) clearTimeout(inkTimer.current);
        inkTimer.current = null;
        inkPending.current = null;
        send(null);
        return;
      }
      const wait = INK_INTERVAL_MS - (Date.now() - inkLast.current);
      if (wait <= 0) {
        inkLast.current = Date.now();
        send(draft);
        return;
      }
      inkPending.current = draft;
      if (inkTimer.current) return;
      inkTimer.current = setTimeout(() => {
        inkTimer.current = null;
        inkLast.current = Date.now();
        const next = inkPending.current;
        inkPending.current = null;
        if (next) send(next);
      }, wait);
    },
    [ephemeral, store],
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
    clearError,
    setNotice,
    deleteRoom,
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
    pile,
    readPiles,
    restack,
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
