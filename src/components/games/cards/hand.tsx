"use client";

import { useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { offsetWithin, pointIn, type PointerLike } from "@/lib/pointer";
import { readFace, type TableState } from "@/lib/table";
import PlayingCard, { cardHeight } from "@/components/cards/playing-card";

/**
 * Which place in the hand a pointer is over, counted in cards, or null when it
 * is somewhere else entirely -- over the felt, on its way to being played.
 * Worked out from where the cards are laid rather than by asking what is under
 * the pointer, which needs a window and gets confused by the card being
 * carried.
 */
export function handGap(root: HTMLElement, event: PointerLike, rotation = 0): number | null {
  const area = root.querySelector<HTMLElement>("[data-hand-area]");
  if (!area) return null;
  const at = pointIn(root, event, rotation);
  const corner = offsetWithin(area, root);
  const x = at.x - corner.x;
  const y = at.y - corner.y;
  const reach = 26;
  if (x < -reach || y < -reach || x > area.clientWidth + reach || y > area.clientHeight + reach) return null;

  const cards = [...area.querySelectorAll<HTMLElement>("[data-hand-index]")];
  if (cards.length === 0) return 0;
  let best = 0;
  let nearest = Infinity;
  let after = false;
  for (const node of cards) {
    const spot = offsetWithin(node, area);
    const cx = spot.x + node.offsetWidth / 2;
    const cy = spot.y + node.offsetHeight / 2;
    // Rows count for more than columns, so a hand spread over several lines
    // drops into the line the pointer is on.
    const d = Math.hypot(cx - x, (cy - y) * 2);
    if (d < nearest) {
      nearest = d;
      best = Number(node.dataset.handIndex) || 0;
      after = x > cx;
    }
  }
  return best + (after ? 1 : 0);
}

/**
 * The hand: fanned the way you would hold it, or spread out in rows when there
 * is too much to read. Cards are picked by tapping -- as many as you like --
 * dragged about to put the hand in the order you want it, and dragged out onto
 * the felt to play them.
 */
export default function Hand({
  cards,
  decks,
  hidden,
  picked,
  dragging,
  gap,
  wide,
  onPointerDown,
}: {
  cards: string[];
  decks: TableState["decks"];
  hidden: boolean;
  picked: number[];
  /** Cards on their way somewhere: drawn faded, and out of the way of the pointer. */
  dragging: number[];
  /** Where a card being carried would drop in, as a place in the hand. */
  gap: number | null;
  wide: boolean;
  onPointerDown: (event: React.PointerEvent, index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observe = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observe.observe(node);
    return () => observe.disconnect();
  }, []);

  const n = cards.length;
  // Tarot cards are taller; whichever deck is on the table sets the shape.
  const shape = decks.find((d) => d.kind === "tarot") ?? decks[0] ?? null;
  // Wide enough to read when spread out, small enough that a big hand fits.
  const cardW = wide
    ? Math.round(Math.max(38, Math.min(62, width / Math.max(6, Math.ceil(Math.sqrt(n * 2.2))))))
    : Math.round(Math.max(40, Math.min(66, width / 6)));
  const height = cardHeight(cardW, shape);
  const step = n > 1 ? Math.min(cardW * 0.62, (width - cardW) / (n - 1)) : 0;
  const total = cardW + step * Math.max(0, n - 1);

  const card = (index: number) => {
    const isPicked = picked.includes(index) && !hidden;
    const isDragging = dragging.includes(index);
    const parsed = hidden ? { face: null, deck: decks[0] ?? null } : readFace(cards[index], decks);
    return (
      <PlayingCard
        face={parsed.face}
        deck={parsed.deck}
        down={hidden}
        width={cardW}
        className={clsx("rounded-[6px]", isPicked && "ring-2 ring-glow", isDragging && "opacity-30")}
      />
    );
  };

  if (wide) {
    return (
      <div
        ref={ref}
        data-hand-area
        className="no-scrollbar flex max-h-40 min-w-0 flex-1 flex-wrap items-start gap-1 overflow-y-auto p-1"
        style={{ minHeight: height + 10 }}
      >
        {n === 0 && <p className="w-full py-4 text-center text-[11px] text-muted/50">your hand is empty</p>}
        {cards.map((value, i) => (
          <div
            key={`${value}-${i}`}
            data-hand-index={i}
            onPointerDown={(event) => onPointerDown(event, i)}
            className={clsx(
              "relative touch-none",
              dragging.includes(i) && "pointer-events-none",
              picked.includes(i) && !hidden && "-translate-y-1",
            )}
          >
            {gap === i && <span className="absolute -left-1 top-0 h-full w-0.5 rounded bg-glow" />}
            {card(i)}
          </div>
        ))}
        {gap === n && <span className="h-full w-0.5 self-stretch rounded bg-glow" />}
      </div>
    );
  }

  return (
    <div ref={ref} data-hand-area className="relative min-w-0 flex-1" style={{ height: height + 16 }}>
      {n === 0 && <p className="pt-4 text-center text-[11px] text-muted/50">your hand is empty</p>}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2" style={{ width: total, height: height + 16 }}>
        {cards.map((value, i) => {
          const angle = n > 1 ? (i - (n - 1) / 2) * Math.min(4, 40 / n) : 0;
          const lift = Math.abs(i - (n - 1) / 2) * Math.min(2, 16 / n);
          const isPicked = picked.includes(i) && !hidden;
          return (
            <div
              key={`${value}-${i}`}
              data-hand-index={i}
              onPointerDown={(event) => onPointerDown(event, i)}
              className={clsx(
                "absolute bottom-0 cursor-grab touch-none transition-transform",
                dragging.includes(i) && "pointer-events-none",
              )}
              style={{
                left: i * step,
                transform: `translateY(${isPicked ? -14 : lift}px) rotate(${angle}deg)`,
                transformOrigin: "50% 140%",
                zIndex: i,
              }}
            >
              {card(i)}
            </div>
          );
        })}
        {gap !== null && (
          <span
            className="pointer-events-none absolute bottom-0 w-0.5 rounded bg-glow"
            style={{ left: Math.min(total, gap * step), height: height + 8 }}
          />
        )}
      </div>
    </div>
  );
}
