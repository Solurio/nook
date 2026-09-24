"use client";

import clsx from "clsx";
import { COLOR_HEX, armiesOn, colorOf, type Territory, type WarState } from "@/lib/war";
import { MAP_H, MAP_W, indexOf, labelSpot, type WarWorld } from "@/lib/war-world";
import { t as tx } from "@/lib/i18n";

type Placed = Partial<Record<Territory, number>>;

export type BoardProps = {
  state: WarState;
  world: WarWorld;
  /** Armies the player is putting down but has not committed yet. */
  placed: Placed;
  from: Territory | null;
  to: Territory | null;
  attackTargets: Territory[];
  moveTargets: Territory[];
  arrow: { from: Territory; to: Territory } | null;
  /** The battle being watched, for the shake on the two territories. */
  battle: { from: Territory; to: Territory; n: number } | null;
  freshBattle: boolean;
  tappable: (t: Territory) => boolean;
  onTap: (t: Territory) => void;
  /** Unique per item, so two boards in one room do not share defs. */
  seaId: string;
};

const FIT = { cover: "xMidYMid slice", contain: "xMidYMid meet", stretch: "none" } as const;

/**
 * Whatever world the game is on, drawn. Nothing here knows the rules: it is
 * handed who owns what and what is lit up, and draws it -- the classic board,
 * ancient Greece, or markers dropped on a photograph of a campaign map.
 */
export default function WarBoard({
  state,
  world,
  placed,
  from,
  to,
  attackTargets,
  moveTargets,
  arrow,
  battle,
  freshBattle,
  tappable,
  onTap,
  seaId,
}: BoardProps) {
  const index = indexOf(world);
  const image = world.image;
  const spot = (t: Territory) => index.byId.get(t) ?? { x: MAP_W / 2, y: MAP_H / 2, shape: undefined };
  const shapeOf = (t: Territory) => (world.shapes ? (index.byId.get(t)?.shape ?? null) : null);
  const tintOf = (t: Territory) => index.continents.get(index.byId.get(t)?.continent ?? "")?.tint ?? "#888";

  const borders: Array<[string, string]> = [];
  for (const [a, list] of index.neighbors) for (const b of list) if (a < b) borders.push([a, b]);

  return (
    <svg
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      className="size-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={tx(`the ${world.name || "WAR"} map`)}
    >
      <defs>
        <radialGradient id={seaId} cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#1b3a55" />
          <stop offset="100%" stopColor="#0c1826" />
        </radialGradient>
        <marker id={`${seaId}-head`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill="#ff6b5e" />
        </marker>
        <clipPath id={`${seaId}-edge`}>
          <rect width={MAP_W} height={MAP_H} />
        </clipPath>
      </defs>

      <rect width={MAP_W} height={MAP_H} fill={world.sea ?? `url(#${seaId})`} />

      {image && (
        <image
          href={image.url}
          width={MAP_W}
          height={MAP_H}
          preserveAspectRatio={FIT[image.fit] ?? FIT.cover}
          opacity={image.opacity}
          clipPath={`url(#${seaId}-edge)`}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Land: a haze of each continent's colour under its territories */}
      {!image &&
        index.continentIds.map((c) => {
          const tint = index.continents.get(c)?.tint ?? "#888";
          return (
            <g key={c} fill={tint} fillOpacity={0.14} stroke={tint} strokeOpacity={0.1} strokeWidth={10} strokeLinejoin="round">
              {(index.members.get(c) ?? []).map((t) => {
                const shape = shapeOf(t);
                const at = spot(t);
                return shape ? <polygon key={t} points={shape} /> : <circle key={t} cx={at.x} cy={at.y} r={40} stroke="none" />;
              })}
            </g>
          );
        })}

      {world.labels &&
        index.continentIds.map((c) => {
          const at = labelSpot(world, c);
          const info = index.continents.get(c);
          return (
            <text
              key={c}
              x={at.x}
              y={at.y}
              textAnchor={at.x > MAP_W * 0.8 ? "end" : at.x < MAP_W * 0.2 ? "start" : "middle"}
              fontSize={11}
              fontWeight={700}
              letterSpacing={1.4}
              fill={info?.tint}
              opacity={0.9}
              stroke="#0c1826"
              strokeWidth={image ? 3 : 0}
              paintOrder="stroke"
            >
              {tx(info?.name ?? c).toUpperCase()} +{info?.bonus ?? 0}
            </text>
          );
        })}

      {/* Borders and sea routes */}
      {world.links &&
        borders.map(([a, b]) => {
          const A = spot(a);
          const B = spot(b);
          const sea = index.byId.get(a)?.continent !== index.byId.get(b)?.continent;
          // A crossing that leaves one side of the world and comes back the other.
          if (Math.abs(A.x - B.x) > MAP_W * 0.55) {
            const [west, east] = A.x < B.x ? [A, B] : [B, A];
            return (
              <g key={`${a}-${b}`} stroke="#e8e0d0" strokeOpacity={0.3} strokeWidth={1.6} strokeDasharray="5 5">
                <line x1={west.x} y1={west.y} x2={0} y2={west.y} />
                <line x1={east.x} y1={east.y} x2={MAP_W} y2={east.y} />
              </g>
            );
          }
          return (
            <line
              key={`${a}-${b}`}
              x1={A.x}
              y1={A.y}
              x2={B.x}
              y2={B.y}
              stroke="#e8e0d0"
              strokeOpacity={sea ? 0.3 : 0.2}
              strokeWidth={1.6}
              strokeDasharray={sea ? "5 5" : undefined}
            />
          );
        })}

      {/* The territories */}
      {index.ids.map((t) => {
        const at = spot(t);
        const shape = shapeOf(t);
        const owner = state.owner[t];
        const color = owner ? COLOR_HEX[colorOf(state, owner)] : { fill: "#3a3444", ink: "#f4efe6" };
        const extra = placed[t] ?? 0;
        const active = tappable(t);
        const isFrom = from === t;
        const isTarget = attackTargets.includes(t);
        const isTo = to === t;
        const lit = isFrom || isTo || isTarget || moveTargets.includes(t);
        const ring = isFrom ? "#f6c177" : isTarget || isTo ? "#ff6b5e" : "#9ee6a8";
        const hit = battle && (battle.from === t || battle.to === t);
        const badge = shape ? 12 : 16;
        const name = index.byId.get(t)?.name ?? t;

        return (
          <g
            key={t}
            onClick={() => onTap(t)}
            style={{ cursor: active ? "pointer" : "default" }}
            aria-label={tx(`${name}: ${armiesOn(state, t)} ${armiesOn(state, t) === 1 ? "army" : "armies"}`)}
          >
            {shape ? (
              <>
                <polygon
                  points={shape}
                  fill={color.fill}
                  fillOpacity={image ? 0.6 : 0.92}
                  stroke={tintOf(t)}
                  strokeOpacity={0.85}
                  strokeWidth={1.2}
                  strokeLinejoin="round"
                />
                {state.step === "place" && active && <polygon points={shape} fill="#f6c177" fillOpacity={0.2} />}
                {lit && (
                  <polygon
                    points={shape}
                    fill="none"
                    stroke={ring}
                    strokeWidth={isTo || isFrom ? 3.4 : 2.2}
                    strokeDasharray={isTo || isFrom ? undefined : "5 4"}
                    strokeLinejoin="round"
                  />
                )}
              </>
            ) : (
              <>
                {lit && (
                  <circle
                    cx={at.x}
                    cy={at.y}
                    r={23}
                    fill="none"
                    stroke={ring}
                    strokeWidth={isTo || isFrom ? 3.5 : 2}
                    strokeDasharray={isTo || isFrom ? undefined : "4 3"}
                  />
                )}
                {state.step === "place" && active && <circle cx={at.x} cy={at.y} r={21} fill="#f6c177" opacity={0.18} />}
              </>
            )}

            <g transform={`translate(${at.x} ${at.y})`}>
              <circle
                r={badge}
                fill={color.fill}
                stroke={shape ? "#100d16" : tintOf(t)}
                strokeWidth={shape ? 1.6 : 2.5}
                fillOpacity={shape && !owner && !image ? 0.85 : 1}
              />
              <text
                y={badge === 12 ? 4 : 5}
                textAnchor="middle"
                fontSize={badge === 12 ? 12 : 14}
                fontWeight={800}
                fill={color.ink}
                className={clsx(hit && freshBattle && "animate-die-land")}
                key={hit ? `${battle?.n}` : "still"}
              >
                {owner ? armiesOn(state, t) + extra : ""}
              </text>
              {extra > 0 && (
                <text x={badge + 2} y={-badge + 3} fontSize={12} fontWeight={800} fill="#f6c177" stroke="#100d16" strokeWidth={3} paintOrder="stroke">
                  +{extra}
                </text>
              )}
              {world.labels && (
                <text y={badge + 14} textAnchor="middle" fontSize={10} fill="#f4efe6" fillOpacity={0.85} stroke="#0c1826" strokeWidth={3} paintOrder="stroke">
                  {tx(name)}
                </text>
              )}
            </g>
          </g>
        );
      })}

      {/* The attack, over the top of everything */}
      {arrow && (
        <line
          x1={spot(arrow.from).x}
          y1={spot(arrow.from).y}
          x2={spot(arrow.to).x + (spot(arrow.from).x - spot(arrow.to).x) * 0.25}
          y2={spot(arrow.to).y + (spot(arrow.from).y - spot(arrow.to).y) * 0.25}
          stroke="#ff6b5e"
          strokeWidth={4}
          strokeLinecap="round"
          markerEnd={`url(#${seaId}-head)`}
          opacity={battle ? 0.9 : 0.6}
          style={{ pointerEvents: "none" }}
        />
      )}
    </svg>
  );
}
