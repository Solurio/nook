"use client";

import { create } from "zustand";
import type { AnyItem, Background, Identity, Message, Peer, Room, TransformPatch } from "@/lib/types";

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 2.5;

export type PanelId = "chat" | "background" | "peers" | null;

interface RoomState {
  room: Room | null;
  items: Record<string, AnyItem>;
  messages: Message[];
  peers: Record<string, Peer>;
  me: Identity | null;

  selectedId: string | null;
  editingId: string | null;
  /** Items this client is mid-drag on; remote updates for these are ignored. */
  grabbed: Set<string>;

  viewport: Viewport;
  panel: PanelId;
  connection: "connecting" | "live" | "offline";
  unreadChat: number;

  setRoom: (room: Room) => void;
  patchRoom: (patch: Partial<Room>) => void;
  setBackground: (background: Background) => void;

  hydrateItems: (items: AnyItem[]) => void;
  upsertItem: (item: AnyItem) => void;
  removeItem: (id: string) => void;
  applyTransform: (patch: TransformPatch) => void;
  patchItemData: (id: string, data: Record<string, unknown>) => void;

  hydrateMessages: (messages: Message[]) => void;
  appendMessage: (message: Message) => void;

  setMe: (me: Identity) => void;
  syncPeers: (peers: Peer[]) => void;
  setPeerCursor: (userId: string, cursor: { x: number; y: number }) => void;

  select: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  grab: (id: string) => void;
  release: (id: string) => void;

  setViewport: (viewport: Viewport) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (factor: number, screenX: number, screenY: number) => void;

  setPanel: (panel: PanelId) => void;
  setConnection: (connection: "connecting" | "live" | "offline") => void;
}

const MESSAGE_LIMIT = 200;

export const useRoomStore = create<RoomState>((set, get) => ({
  room: null,
  items: {},
  messages: [],
  peers: {},
  me: null,

  selectedId: null,
  editingId: null,
  grabbed: new Set<string>(),

  viewport: { x: 0, y: 0, scale: 1 },
  panel: null,
  connection: "connecting",
  unreadChat: 0,

  setRoom: (room) => set({ room }),
  patchRoom: (patch) =>
    set((s) => (s.room ? { room: { ...s.room, ...patch } } : {})),
  setBackground: (background) =>
    set((s) => (s.room ? { room: { ...s.room, background } } : {})),

  hydrateItems: (items) =>
    set({ items: Object.fromEntries(items.map((item) => [item.id, item])) }),

  upsertItem: (item) =>
    set((s) => {
      // A drag in progress is the local truth; late echoes must not snap it back.
      if (s.grabbed.has(item.id)) {
        const local = s.items[item.id];
        if (local) {
          return {
            items: {
              ...s.items,
              [item.id]: {
                ...item,
                x: local.x,
                y: local.y,
                width: local.width,
                height: local.height,
                rotation: local.rotation,
              },
            },
          };
        }
      }
      return { items: { ...s.items, [item.id]: item } };
    }),

  removeItem: (id) =>
    set((s) => {
      if (!s.items[id]) return {};
      const next = { ...s.items };
      delete next[id];
      return {
        items: next,
        selectedId: s.selectedId === id ? null : s.selectedId,
        editingId: s.editingId === id ? null : s.editingId,
      };
    }),

  applyTransform: (patch) =>
    set((s) => {
      const item = s.items[patch.id];
      if (!item || s.grabbed.has(patch.id)) return {};
      return {
        items: {
          ...s.items,
          [patch.id]: {
            ...item,
            x: patch.x,
            y: patch.y,
            width: patch.width,
            height: patch.height,
            rotation: patch.rotation,
          },
        },
      };
    }),

  patchItemData: (id, data) =>
    set((s) => {
      const item = s.items[id];
      if (!item) return {};
      return {
        items: {
          ...s.items,
          [id]: { ...item, data: { ...(item.data as object), ...data } as AnyItem["data"] },
        },
      };
    }),

  hydrateMessages: (messages) => set({ messages: messages.slice(-MESSAGE_LIMIT) }),

  appendMessage: (message) =>
    set((s) => {
      if (s.messages.some((m) => m.id === message.id)) return {};
      const messages = [...s.messages, message].slice(-MESSAGE_LIMIT);
      const mine = s.me?.userId === message.author_id;
      const unreadChat =
        s.panel === "chat" || mine ? s.unreadChat : s.unreadChat + 1;
      return { messages, unreadChat };
    }),

  setMe: (me) => set({ me }),

  syncPeers: (peers) =>
    set((s) => {
      const next: Record<string, Peer> = {};
      for (const peer of peers) {
        // Carry the last known cursor across presence resyncs so avatars
        // do not blink out of the canvas on every join or leave.
        const previous = s.peers[peer.userId];
        next[peer.userId] = previous?.cursor ? { ...peer, cursor: previous.cursor } : peer;
      }
      return { peers: next };
    }),

  setPeerCursor: (userId, cursor) =>
    set((s) => {
      const peer = s.peers[userId];
      if (!peer) return {};
      return { peers: { ...s.peers, [userId]: { ...peer, cursor } } };
    }),

  select: (id) => set((s) => ({ selectedId: id, editingId: s.editingId === id ? id : null })),
  setEditing: (id) => set({ editingId: id, ...(id ? { selectedId: id } : {}) }),

  grab: (id) =>
    set((s) => {
      const grabbed = new Set(s.grabbed);
      grabbed.add(id);
      return { grabbed };
    }),

  release: (id) =>
    set((s) => {
      const grabbed = new Set(s.grabbed);
      grabbed.delete(id);
      return { grabbed };
    }),

  setViewport: (viewport) => set({ viewport }),

  panBy: (dx, dy) =>
    set((s) => ({ viewport: { ...s.viewport, x: s.viewport.x + dx, y: s.viewport.y + dy } })),

  zoomAt: (factor, screenX, screenY) => {
    const { viewport } = get();
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewport.scale * factor));
    if (scale === viewport.scale) return;

    // Keep the point under the pointer pinned while the scale changes.
    const worldX = (screenX - viewport.x) / viewport.scale;
    const worldY = (screenY - viewport.y) / viewport.scale;

    set({
      viewport: {
        scale,
        x: screenX - worldX * scale,
        y: screenY - worldY * scale,
      },
    });
  },

  setPanel: (panel) =>
    set((s) => ({ panel, unreadChat: panel === "chat" ? 0 : s.unreadChat })),

  setConnection: (connection) => set({ connection }),
}));

/**
 * Items in paint order. This allocates a new array every call, so it must be
 * memoized against the items map rather than handed straight to the store hook
 * as a selector, or useSyncExternalStore would see an ever-changing snapshot
 * and spin. See Canvas.
 */
export function orderItems(items: Record<string, AnyItem>): AnyItem[] {
  return Object.values(items).sort(
    (a, b) => a.z - b.z || a.created_at.localeCompare(b.created_at),
  );
}

export function screenToWorld(viewport: Viewport, screenX: number, screenY: number) {
  return {
    x: (screenX - viewport.x) / viewport.scale,
    y: (screenY - viewport.y) / viewport.scale,
  };
}
