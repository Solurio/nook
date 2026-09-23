"use client";

import { EDGES, HEXES, VERTICES } from "@/lib/catan-board";
import { pips, YIELD, type CatanState } from "@/lib/catan";
import { RESOURCE_COLOR, ResourceGlyph, TERRAIN_COLOR } from "./catan-icons";
import { t } from "@/lib/i18n";

/** One hex side, in board units. */
const S = 50;
const px = (v: number) => v * S;

export const PLAYER_COLOR: Record<string, { fill: string; edge: string }> = {
  s0: { fill: "#e0524a", edge: "#6e1d18" },
  s1: { fill: "#4a86e0", edge: "#173766" },
  s2: { fill: "#efeae1", edge: "#5b5650" },
  s3: { fill: "#f09a3e", edge: "#6b3a0c" },
};

function hexPoints(h: number): string {
  return HEXES[h].corners.map((v) => `${px(VERTICES[v].x)},${px(VERTICES[v].y)}`).join(" ");
}

function Settlement({ x, y, color }: { x: number; y: number; color: { fill: string; edge: string } }) {
  return (
    <polygon
      points={`${x - 9},${y + 8} ${x - 9},${y - 2} ${x},${y - 11} ${x + 9},${y - 2} ${x + 9},${y + 8}`}
      fill={color.fill}
      stroke={color.edge}
      strokeWidth={2}
      strokeLinejoin="round"
    />
  );
}

function City({ x, y, color }: { x: number; y: number; color: { fill: string; edge: string } }) {
  return (
    <polygon
      points={`${x - 14},${y + 10} ${x - 14},${y - 1} ${x - 7},${y - 11} ${x},${y - 1} ${x + 14},${y - 1} ${x + 14},${y + 10}`}
      fill={color.fill}
      stroke={color.edge}
      strokeWidth={2}
      strokeLinejoin="round"
    />
  );
}

/**
 * The island as everyone sees it. Whatever the player in front of it may do
 * right now -- corners to settle, edges to build on, hexes for the robber --
 * is lit and takes a tap.
 */
export default function CatanBoardView({
  state,
  spots,
  onVertex,
  onEdge,
  onHex,
}: {
  state: CatanState;
  spots: { vertices: number[]; edges: number[]; hexes: number[]; roadColor?: string };
  onVertex: (v: number) => void;
  onEdge: (e: number) => void;
  onHex: (h: number) => void;
}) {
  const board = state.board;
  if (!board) return null;
  const rolled = state.dice ? state.dice[0] + state.dice[1] : null;
  const width = 11.4;
  const height = 10.4;

  return (
    <svg viewBox={`${px(-width / 2)} ${px(-height / 2)} ${px(width)} ${px(height)}`} className="size-full" role="img" aria-label={t("the island")}>
      <defs>
        <radialGradient id="catan-sea" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#2a6f95" />
          <stop offset="100%" stopColor="#123a55" />
        </radialGradient>
      </defs>
      <rect x={px(-width / 2)} y={px(-height / 2)} width={px(width)} height={px(height)} rx={24} fill="url(#catan-sea)" />

      {/* Harbours, with their jetties to the two corners they serve */}
      {board.harbours.map((h) => {
        const e = EDGES[h.edge];
        const out = { x: e.mid.x * 1.2, y: e.mid.y * 1.2 };
        const two = h.kind === "any" ? "3:1" : "2:1";
        return (
          <g key={h.edge}>
            {[e.a, e.b].map((v) => (
              <line key={v} x1={px(out.x)} y1={px(out.y)} x2={px(VERTICES[v].x)} y2={px(VERTICES[v].y)} stroke="#c9a46a" strokeWidth={4} strokeLinecap="round" opacity={0.8} />
            ))}
            <circle cx={px(out.x)} cy={px(out.y)} r={15} fill="#f4efe6" stroke="#8a6a3a" strokeWidth={2} />
            {h.kind === "any" ? (
              <text x={px(out.x)} y={px(out.y) + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#3a2a14">
                ?
              </text>
            ) : (
              <g transform={`translate(${px(out.x) - 7} ${px(out.y) - 10}) scale(0.875)`}>
                <ResourceGlyph r={h.kind} color={RESOURCE_COLOR[h.kind]} />
              </g>
            )}
            <text x={px(out.x)} y={px(out.y) + (h.kind === "any" ? -5 : 11)} textAnchor="middle" fontSize={8} fontWeight={800} fill="#3a2a14">
              {two}
            </text>
          </g>
        );
      })}

      {/* The land */}
      {board.hexes.map((hex, h) => {
        const c = HEXES[h].center;
        const r = YIELD[hex.terrain];
        const hot = rolled !== null && rolled !== 7 && hex.number === rolled && h !== state.robber;
        return (
          <g key={h}>
            <polygon points={hexPoints(h)} fill={TERRAIN_COLOR[hex.terrain]} stroke="#e9dcc0" strokeWidth={3} strokeLinejoin="round" />
            {hot && <polygon points={hexPoints(h)} fill="#fff6d0" opacity={0.28} className="animate-pulse" />}
            {r && (
              <g transform={`translate(${px(c.x) - 12} ${px(c.y) - 38}) scale(1.5)`} opacity={0.55}>
                <ResourceGlyph r={r} color="#1b1a16" />
              </g>
            )}
            {hex.number !== null && (
              <g>
                <circle cx={px(c.x)} cy={px(c.y) + 4} r={15} fill="#f4ecd6" stroke="#8a7550" strokeWidth={1.5} />
                <text
                  x={px(c.x)}
                  y={px(c.y) + 8}
                  textAnchor="middle"
                  fontSize={hex.number === 6 || hex.number === 8 ? 15 : 13}
                  fontWeight={800}
                  fill={hex.number === 6 || hex.number === 8 ? "#c2261d" : "#2a2218"}
                >
                  {hex.number}
                </text>
                {Array.from({ length: pips(hex.number) }, (_, i) => (
                  <circle
                    key={i}
                    cx={px(c.x) + (i - (pips(hex.number as number) - 1) / 2) * 3.4}
                    cy={px(c.y) + 13.5}
                    r={1.1}
                    fill={hex.number === 6 || hex.number === 8 ? "#c2261d" : "#2a2218"}
                  />
                ))}
              </g>
            )}
            {state.robber === h && (
              <g transform={`translate(${px(c.x) + 18} ${px(c.y) - 6})`} style={{ transition: "transform 300ms ease" }}>
                <ellipse cx={0} cy={16} rx={8} ry={3} fill="rgba(0,0,0,0.35)" />
                <path d="M -6 15 Q -8 2 -3 -2 A 5 5 0 1 1 3 -2 Q 8 2 6 15 Z" fill="#2b2530" stroke="#0d0b10" strokeWidth={1.5} />
              </g>
            )}
            {spots.hexes.includes(h) && (
              <polygon
                points={hexPoints(h)}
                fill="#e0524a"
                fillOpacity={0.18}
                stroke="#ff8a7a"
                strokeWidth={3}
                style={{ cursor: "pointer" }}
                onClick={() => onHex(h)}
              />
            )}
          </g>
        );
      })}

      {/* Roads */}
      {Object.entries(state.roads).map(([e, chair]) => {
        const edge = EDGES[Number(e)];
        const a = VERTICES[edge.a];
        const b = VERTICES[edge.b];
        const k = 0.16;
        const color = PLAYER_COLOR[chair] ?? PLAYER_COLOR.s0;
        return (
          <line
            key={e}
            x1={px(a.x + (b.x - a.x) * k)}
            y1={px(a.y + (b.y - a.y) * k)}
            x2={px(b.x - (b.x - a.x) * k)}
            y2={px(b.y - (b.y - a.y) * k)}
            stroke={color.fill}
            strokeWidth={8}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 1.5px ${color.edge})` }}
          />
        );
      })}

      {/* Where a road can go */}
      {spots.edges.map((e) => {
        const edge = EDGES[e];
        const a = VERTICES[edge.a];
        const b = VERTICES[edge.b];
        return (
          <g key={e} style={{ cursor: "pointer" }} onClick={() => onEdge(e)}>
            <line x1={px(a.x)} y1={px(a.y)} x2={px(b.x)} y2={px(b.y)} stroke="transparent" strokeWidth={18} />
            <line
              x1={px(a.x + (b.x - a.x) * 0.2)}
              y1={px(a.y + (b.y - a.y) * 0.2)}
              x2={px(b.x - (b.x - a.x) * 0.2)}
              y2={px(b.y - (b.y - a.y) * 0.2)}
              stroke={spots.roadColor ?? "#fff"}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray="4 5"
              opacity={0.85}
              className="animate-pulse"
            />
          </g>
        );
      })}

      {/* Settlements and cities */}
      {Object.entries(state.buildings).map(([v, b]) => {
        const p = VERTICES[Number(v)];
        const color = PLAYER_COLOR[b.chair] ?? PLAYER_COLOR.s0;
        return b.city ? <City key={v} x={px(p.x)} y={px(p.y)} color={color} /> : <Settlement key={v} x={px(p.x)} y={px(p.y)} color={color} />;
      })}

      {/* Where a settlement or a city can go */}
      {spots.vertices.map((v) => (
        <circle
          key={v}
          cx={px(VERTICES[v].x)}
          cy={px(VERTICES[v].y)}
          r={9}
          fill="#fff"
          fillOpacity={0.35}
          stroke="#fff"
          strokeWidth={2.5}
          className="animate-pulse"
          style={{ cursor: "pointer" }}
          onClick={() => onVertex(v)}
        />
      ))}
    </svg>
  );
}
