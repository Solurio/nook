"use client";

import type { Identity } from "./types";

const STORAGE_KEY = "nook.identity";

export const TINTS = [
  "#f2a4b8",
  "#f6c177",
  "#a6d189",
  "#8bc7e8",
  "#c4a7f0",
  "#f28e6a",
  "#7fd6c2",
  "#e0a3d8",
] as const;

const ADJECTIVES = [
  "quiet", "sleepy", "velvet", "amber", "salty", "little", "dusty", "soft",
  "wandering", "moonlit", "rusty", "warm", "hazy", "second", "lucky",
];

const NOUNS = [
  "moth", "lamp", "fox", "ferry", "plum", "kite", "otter", "signal",
  "pigeon", "cassette", "orbit", "thistle", "harbor", "sparrow", "comet",
];

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function randomName(): string {
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
}

export function randomTint(): string {
  return pick(TINTS);
}

/** Reads the saved nickname and colour, if the visitor has been here before. */
export function loadLocalIdentity(): Pick<Identity, "name" | "tint"> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Identity>;
    if (typeof parsed.name !== "string" || typeof parsed.tint !== "string") return null;
    return { name: parsed.name, tint: parsed.tint };
  } catch {
    return null;
  }
}

export function saveLocalIdentity(value: Pick<Identity, "name" | "tint">) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota. Not worth interrupting anyone over.
  }
}

// ---------------------------------------------------------------------------
// Visited rooms, so the landing page can offer a way back in.
// ---------------------------------------------------------------------------

const RECENT_KEY = "nook.recent";
const RECENT_LIMIT = 8;

export interface RecentRoom {
  slug: string;
  name: string;
  visitedAt: number;
}

export function loadRecentRooms(): RecentRoom[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as RecentRoom[])
      .filter((r) => r && typeof r.slug === "string")
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function rememberRoom(slug: string, name: string) {
  if (typeof window === "undefined") return;
  const rest = loadRecentRooms().filter((r) => r.slug !== slug);
  const next = [{ slug, name, visitedAt: Date.now() }, ...rest].slice(0, RECENT_LIMIT);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // See above.
  }
}

export function forgetRoom(slug: string) {
  if (typeof window === "undefined") return;
  const next = loadRecentRooms().filter((r) => r.slug !== slug);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // See above.
  }
}
