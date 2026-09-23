"use client";

import clsx from "clsx";
import { Lock } from "lucide-react";
import { readFace, type Stack, type TableState } from "@/lib/table";
import PlayingCard, { cardHeight } from "@/components/cards/playing-card";

/** How many cards of a spread one can see at once before it is just a fan of edges. */
const MOST = 16;

/**
 * A stack on the felt: squared up it is a block of card edges with the top one
 * showing, spread it is a fan or a row you can read -- and, when it is yours to
 * pick from, one you can tap card by card.
 */
export default function StackView({
  stack,
  decks,
  size,
  cardW,
  selected,
  owned,
  showOwned,
  ownerName,
  dragging,
  chosen,
  onPointerDown,
  onCardTap,
}: {
  stack: Stack;
  decks: TableState["decks"];
  size: number;
  cardW: number;
  selected: boolean;
  /** The cards of a face-down stack that belongs to me, when I have them. */
  owned: string[] | null;
  showOwned: boolean;
  ownerName: string | null;
  dragging: boolean;
  /** Which cards of a spread are picked, by their place in the stack. */
  chosen: number[];
  onPointerDown: (event: React.PointerEvent) => void;
  onCardTap?: (index: number) => void;
}) {
  const faceUp = stack.face === "up";
  const cards = faceUp ? (stack.cards ?? []) : showOwned && owned ? owned : [];
  const reveal = faceUp || (showOwned && owned !== null);
  const backDeck = decks[0] ?? null;
  // Tarot cards are taller than playing cards, and set the height of the row.
  const tallest = cardHeight(cardW, decks.find((d) => d.kind === "tarot") ?? backDeck);

  const spread = stack.layout !== "stack" && size > 1;
  const step = stack.layout === "fan" ? cardW * 0.3 : cardW * 0.66;
  const shown = Math.min(size, spread ? MOST : 1);
  const width = spread ? cardW + step * (shown - 1) : cardW;

  return (
    <div
      onPointerDown={onPointerDown}
      className={clsx("absolute touch-none select-none", dragging ? "cursor-grabbing" : "cursor-grab")}
      style={{
        left: `${stack.x * 100}%`,
        top: `${stack.y * 100}%`,
        zIndex: dragging ? 9999 : stack.z,
        transform: `translate(-50%, -50%) ${stack.turned ? "rotate(180deg)" : ""} ${dragging ? "scale(1.06)" : ""}`,
        transition: dragging ? "none" : "transform 120ms ease-out",
        width,
      }}
    >
      {size === 0 ? (
        <div
          className="grid place-items-center rounded-[6px] border-2 border-dashed border-white/25 text-[9px] text-white/45"
          style={{ width: cardW, height: tallest }}
        >
          {stack.label ?? "empty"}
        </div>
      ) : spread ? (
        <div className="relative" style={{ height: tallest + 10 }}>
          {Array.from({ length: shown }, (_, i) => {
            // Drawn right to left so the top card of the stack sits on top.
            const index = shown - 1 - i;
            const card = cards[index];
            const angle = stack.layout === "fan" ? (i - (shown - 1) / 2) * 4 : 0;
            const parsed = card ? readFace(card, decks) : { deck: backDeck, face: null };
            const picked = chosen.includes(index);
            return (
              <div
                key={i}
                className="absolute top-0"
                style={{
                  left: i * step,
                  transform: `rotate(${angle}deg) translateY(${picked ? -9 : 0}px)`,
                  transformOrigin: "50% 120%",
                  transition: "transform 110ms ease-out",
                }}
                onPointerDown={
                  onCardTap && card
                    ? (event) => {
                        event.stopPropagation();
                        onCardTap(index);
                      }
                    : undefined
                }
              >
                <PlayingCard
                  face={reveal ? parsed.face : null}
                  deck={parsed.deck ?? backDeck}
                  down={!reveal}
                  width={cardW}
                  className={picked ? "rounded-[6px] ring-2 ring-glow" : undefined}
                />
              </div>
            );
          })}
          {size > MOST && (
            <span className="absolute -top-2 right-0 rounded-full bg-ink-950/85 px-1 text-[9px] text-chalk tabular-nums ring-1 ring-white/20">
              +{size - MOST}
            </span>
          )}
        </div>
      ) : (
        <div className="relative" style={{ paddingTop: Math.min(size, 10) * 0.7 }}>
          {/* The depth of the pile, a card's edge at a time. */}
          {Array.from({ length: Math.min(size - 1, 9) }, (_, i) => (
            <div
              key={i}
              className="absolute left-0 rounded-[6px] bg-[#e9e2d0] shadow-[0_0_0_0.5px_rgba(0,0,0,0.3)]"
              style={{ top: (Math.min(size, 10) - 1 - i) * 0.7, width: cardW, height: tallest }}
            />
          ))}
          <div className="relative">
            {(() => {
              const top = cards[0];
              const parsed = top ? readFace(top, decks) : { deck: backDeck, face: null };
              return (
                <PlayingCard
                  face={reveal ? parsed.face : null}
                  deck={parsed.deck ?? backDeck}
                  down={!reveal}
                  width={cardW}
                />
              );
            })()}
          </div>
        </div>
      )}

      {size > 1 && (
        <span className="absolute -right-1.5 -bottom-1.5 grid min-w-5 place-items-center rounded-full bg-ink-950/85 px-1 text-[9px] font-semibold text-chalk tabular-nums ring-1 ring-white/20">
          {size}
        </span>
      )}
      {stack.owner && size > 0 && (
        <span className="absolute -top-1.5 -left-1.5 grid size-4 place-items-center rounded-full bg-ink-950/85 text-glow ring-1 ring-white/20">
          <Lock className="size-2.5" />
        </span>
      )}
      {(stack.label || ownerName) && size > 0 && (
        <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded bg-black/35 px-1.5 py-px text-[9px] whitespace-nowrap text-white/75">
          {stack.label ?? `${ownerName}'s`}
        </span>
      )}
      {selected && (
        <span className="pointer-events-none absolute -inset-1.5 rounded-[9px] shadow-[0_0_14px_rgba(196,167,240,0.6)] ring-2 ring-glow" />
      )}
    </div>
  );
}
