"use client";

import type { Resource, Terrain } from "@/lib/catan";
import { t } from "@/lib/i18n";

export const RESOURCE_COLOR: Record<Resource, string> = {
  wood: "#3f8f4a",
  brick: "#c4622d",
  sheep: "#9ccf62",
  wheat: "#e8c43a",
  ore: "#9aa0ab",
};

export const TERRAIN_COLOR: Record<Terrain, string> = {
  forest: "#2f6f3a",
  hills: "#b4582c",
  pasture: "#88bf55",
  fields: "#d9b23c",
  mountains: "#7c828d",
  desert: "#d8c08a",
};

export const RESOURCE_NAME: Record<Resource, string> = {
  wood: "wood",
  brick: "brick",
  sheep: "sheep",
  wheat: "wheat",
  ore: "ore",
};

/** A resource drawn small, in a 16 unit box, to sit on a card or a hex. */
export function ResourceGlyph({ r, color = "currentColor" }: { r: Resource; color?: string }) {
  switch (r) {
    case "wood":
      return (
        <g fill={color}>
          <polygon points="8,1.5 13,8.5 10.5,8.5 14,13 2,13 5.5,8.5 3,8.5" />
          <rect x="7" y="13" width="2" height="2" />
        </g>
      );
    case "brick":
      return (
        <g fill={color}>
          <rect x="1.5" y="3" width="6" height="3" rx="0.5" />
          <rect x="8.5" y="3" width="6" height="3" rx="0.5" />
          <rect x="4.5" y="7" width="7" height="3" rx="0.5" />
          <rect x="1.5" y="11" width="6" height="3" rx="0.5" />
          <rect x="8.5" y="11" width="6" height="3" rx="0.5" />
        </g>
      );
    case "sheep":
      return (
        <g fill={color}>
          <circle cx="6" cy="7" r="3" />
          <circle cx="9.5" cy="6.5" r="3" />
          <circle cx="8" cy="9.5" r="3.2" />
          <circle cx="12.8" cy="8.6" r="1.8" />
          <rect x="5.5" y="11.5" width="1.4" height="3" />
          <rect x="9.5" y="11.5" width="1.4" height="3" />
        </g>
      );
    case "wheat":
      return (
        <g fill={color}>
          <rect x="7.4" y="3" width="1.2" height="12" />
          {[3.5, 6.5, 9.5].map((y) => (
            <g key={y}>
              <ellipse cx="6" cy={y} rx="1.6" ry="2.4" transform={`rotate(-30 6 ${y})`} />
              <ellipse cx="10" cy={y} rx="1.6" ry="2.4" transform={`rotate(30 10 ${y})`} />
            </g>
          ))}
        </g>
      );
    case "ore":
      return <polygon fill={color} points="2,13 5,5 9,2 13,6 14.5,13" />;
  }
}

/** A resource on a little card, with a count. */
export function ResourceChip({ r, n, size = 22, dim }: { r: Resource; n?: number; size?: number; dim?: boolean }) {
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size * 1.3, opacity: dim ? 0.35 : 1 }} title={t(RESOURCE_NAME[r])}>
      <svg viewBox="0 0 16 21" className="size-full" aria-hidden>
        <rect x="0.5" y="0.5" width="15" height="20" rx="2.5" fill="#f4efe6" stroke="rgba(0,0,0,0.25)" />
        <g transform="translate(0 2.5)">
          <ResourceGlyph r={r} color={RESOURCE_COLOR[r]} />
        </g>
      </svg>
      {n !== undefined && (
        <span className="absolute -right-1.5 -bottom-1 min-w-4 rounded-full bg-ink-950 px-1 text-center text-[9px] font-bold text-chalk tabular-nums ring-1 ring-white/20">
          {n}
        </span>
      )}
    </span>
  );
}
