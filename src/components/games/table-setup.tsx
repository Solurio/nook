"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { ImagePlus, Minus, Plus, Trash2, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { RANKS, SUITS, type Rank, type Suit } from "@/lib/cards";
import {
  BACK_COLORS,
  MAX_CHAIRS,
  PRESET_NAME,
  chairsFor,
  deckCards,
  presetDecks,
  readFace,
  type BackPattern,
  type CustomCard,
  type DeckDef,
  type Preset,
  type TableState,
} from "@/lib/table";
import PlayingCard from "@/components/cards/playing-card";

const SUIT_MARK: Record<Suit, string> = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
const PATTERNS: BackPattern[] = ["lattice", "stripes", "dots", "plain"];
const CUSTOM_COLORS = ["#f6c177", "#f2a4b8", "#a6d189", "#8bc7e8", "#c4a7f0", "#e0655c", "#f4efe6"];

/**
 * Choosing what is on the table: how many chairs, and which decks -- a
 * standard deck with only the cards your game uses, a tarot, or cards you
 * made up, each with whatever back you like.
 */
export default function TableSetup({
  table,
  onClose,
  onSave,
  onSetTable,
}: {
  table: TableState;
  onClose: () => void;
  onSave: (next: TableState) => void;
  onSetTable: (next: TableState) => void;
}) {
  const [decks, setDecks] = useState<DeckDef[]>(table.decks);
  const [seatCount, setSeatCount] = useState(table.seatCount);
  const [teams, setTeams] = useState(table.teams);
  const [adding, setAdding] = useState(false);

  const next = (): TableState => {
    const keep = chairsFor(seatCount);
    return {
      ...table,
      decks,
      seatCount,
      teams: seatCount % 2 === 0 ? teams : 0,
      seats: Object.fromEntries(keep.map((c) => [c, table.seats[c] ?? null])),
      holders: Object.fromEntries(keep.map((c) => [c, table.holders?.[c] ?? null])),
    };
  };

  const update = (id: string, patch: Partial<DeckDef>) =>
    setDecks((current) => current.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const addDeck = (preset: Preset) => {
    const used = new Set(decks.map((d) => d.id));
    let n = decks.length + 1;
    while (used.has(`d${n}`)) n += 1;
    setDecks((current) => [...current, ...presetDecks(preset, `d${n}`)]);
    setAdding(false);
  };

  const total = decks.reduce((sum, d) => sum + deckCards(d).length, 0);

  return (
    <div className="absolute inset-0 z-30 flex flex-col rounded-2xl bg-ink-950/96 backdrop-blur-sm">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/8 px-3 py-2">
        <h3 className="text-[13px] font-semibold">decks and chairs</h3>
        <span className="text-[10px] text-muted/60">{total} cards in all</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="ml-auto grid size-9 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          <X className="size-4" strokeWidth={2.4} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <section className="flex flex-wrap items-center gap-2 rounded-xl bg-white/4 p-2.5">
          <span className="text-[11px] text-muted">chairs</span>
          <Stepper value={seatCount} min={1} max={MAX_CHAIRS} onChange={setSeatCount} />
          {seatCount % 2 === 0 && seatCount >= 4 && (
            <button
              type="button"
              onClick={() => setTeams(teams >= 2 ? 0 : 2)}
              className={clsx(
                "min-h-8 rounded-lg px-2.5 text-[11px] transition",
                teams >= 2 ? "bg-glow/22 text-glow" : "bg-white/6 text-muted",
              )}
            >
              {teams >= 2 ? "partners across the table" : "everyone for themselves"}
            </button>
          )}
        </section>

        {decks.map((deck) => (
          <DeckEditor
            key={deck.id}
            deck={deck}
            onChange={(patch) => update(deck.id, patch)}
            onRemove={decks.length > 1 ? () => setDecks((d) => d.filter((x) => x.id !== deck.id)) : undefined}
          />
        ))}

        {adding ? (
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(PRESET_NAME) as Preset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => addDeck(preset)}
                className="min-h-10 rounded-xl bg-white/6 px-2 text-left text-[11px] text-chalk transition hover:bg-white/10"
              >
                {PRESET_NAME[preset]}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 text-[12px] text-muted transition hover:text-chalk"
          >
            <Plus className="size-4" /> another deck
          </button>
        )}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-white/8 p-2.5">
        <button
          type="button"
          onClick={() => onSave(next())}
          className="min-h-10 flex-1 rounded-xl bg-white/8 text-[12px] font-medium text-chalk transition hover:bg-white/12"
        >
          keep the table as it is
        </button>
        <button
          type="button"
          onClick={() => onSetTable(next())}
          className="min-h-10 flex-1 rounded-xl bg-[#f3ead7] text-[12px] font-semibold text-[#2a2118] transition active:scale-[0.98]"
        >
          clear and set the table
        </button>
      </div>
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <span className="flex items-center gap-0.5 rounded-lg bg-white/6">
      <button
        type="button"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="grid size-8 place-items-center text-muted disabled:opacity-30"
        aria-label="fewer"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-5 text-center text-[12px] text-chalk tabular-nums">{value}</span>
      <button
        type="button"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="grid size-8 place-items-center text-muted disabled:opacity-30"
        aria-label="more"
      >
        <Plus className="size-3.5" />
      </button>
    </span>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "min-h-8 min-w-8 rounded-lg px-1.5 text-[11px] font-medium transition",
        on ? "bg-chalk text-ink-950" : "bg-white/6 text-muted/70",
      )}
    >
      {children}
    </button>
  );
}

function DeckEditor({
  deck,
  onChange,
  onRemove,
}: {
  deck: DeckDef;
  onChange: (patch: Partial<DeckDef>) => void;
  onRemove?: () => void;
}) {
  const cards = deckCards(deck);
  const sample = cards[cards.length > 12 ? 12 : 0];

  return (
    <section className="space-y-2.5 rounded-xl bg-white/4 p-2.5">
      <div className="flex items-start gap-2.5">
        <div className="flex shrink-0 gap-1">
          {sample && <PlayingCard {...readFace(sample, [deck])} width={40} />}
          <PlayingCard face={null} deck={deck} down width={40} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <input
            value={deck.name}
            onChange={(event) => onChange({ name: event.target.value.slice(0, 24) })}
            onKeyDown={(event) => event.stopPropagation()}
            className="h-8 w-full rounded-lg bg-white/7 px-2 text-[12px] ring-1 ring-white/10 outline-none focus:ring-glow/45"
          />
          <p className="text-[10px] text-muted/60">
            {deck.kind} · {cards.length} cards
          </p>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="take this deck away"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-red-500/15 hover:text-red-300"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {deck.kind === "standard" && deck.config && (
        <>
          <div className="flex flex-wrap gap-1">
            {RANKS.map((rank) => {
              const on = deck.config?.ranks.includes(rank) ?? false;
              return (
                <Chip
                  key={rank}
                  on={on}
                  onClick={() => {
                    const ranks = on
                      ? (deck.config?.ranks ?? []).filter((r) => r !== rank)
                      : RANKS.filter((r) => r === rank || deck.config?.ranks.includes(r));
                    if (ranks.length > 0 && deck.config) onChange({ config: { ...deck.config, ranks: ranks as Rank[] } });
                  }}
                >
                  {rank}
                </Chip>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {SUITS.map((suit) => {
              const on = deck.config?.suits.includes(suit) ?? false;
              return (
                <Chip
                  key={suit}
                  on={on}
                  onClick={() => {
                    const suits = on
                      ? (deck.config?.suits ?? []).filter((s) => s !== suit)
                      : SUITS.filter((s) => s === suit || deck.config?.suits.includes(s));
                    if (suits.length > 0 && deck.config) onChange({ config: { ...deck.config, suits: suits as Suit[] } });
                  }}
                >
                  {SUIT_MARK[suit]}
                </Chip>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span>jokers</span>
            <Stepper
              value={deck.config.jokers}
              min={0}
              max={2}
              onChange={(jokers) => deck.config && onChange({ config: { ...deck.config, jokers } })}
            />
            <span>copies</span>
            <Stepper
              value={deck.config.copies}
              min={1}
              max={4}
              onChange={(copies) => deck.config && onChange({ config: { ...deck.config, copies } })}
            />
          </div>
        </>
      )}

      {deck.kind === "tarot" && (
        <div className="flex flex-wrap items-center gap-1">
          {(["classic", "night", "rose"] as const).map((theme) => (
            <Chip key={theme} on={(deck.theme ?? "classic") === theme} onClick={() => onChange({ theme })}>
              {theme}
            </Chip>
          ))}
          <Chip on={Boolean(deck.reversals)} onClick={() => onChange({ reversals: !deck.reversals })}>
            reversals
          </Chip>
        </div>
      )}

      {deck.kind === "custom" && (
        <CustomCards cards={deck.custom ?? []} onChange={(custom) => onChange({ custom })} />
      )}

      <BackEditor deck={deck} onChange={onChange} />
    </section>
  );
}

function CustomCards({
  cards,
  onChange,
}: {
  cards: CustomCard[];
  onChange: (cards: CustomCard[]) => void;
}) {
  const patch = (id: string, p: Partial<CustomCard>) =>
    onChange(cards.map((c) => (c.id === id ? { ...c, ...p } : c)));

  return (
    <div className="space-y-1.5">
      {cards.map((card) => (
        <div key={card.id} className="space-y-1 rounded-lg bg-white/4 p-1.5">
          <div className="flex items-center gap-1">
            <input
              value={card.title}
              onChange={(event) => patch(card.id, { title: event.target.value.slice(0, 18) })}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="title"
              className="h-8 min-w-0 flex-1 rounded-md bg-white/7 px-2 text-[11px] outline-none"
            />
            <Stepper value={card.copies} min={1} max={20} onChange={(copies) => patch(card.id, { copies })} />
            <button
              type="button"
              onClick={() => onChange(cards.filter((c) => c.id !== card.id))}
              disabled={cards.length <= 1}
              aria-label="remove this card"
              className="grid size-8 place-items-center text-muted disabled:opacity-30"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <input
            value={card.text ?? ""}
            onChange={(event) => patch(card.id, { text: event.target.value.slice(0, 90) })}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="what it says (optional)"
            className="h-8 w-full rounded-md bg-white/7 px-2 text-[11px] outline-none"
          />
          <div className="flex flex-wrap items-center gap-1">
            {CUSTOM_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => patch(card.id, { color })}
                aria-label={`colour ${color}`}
                className={clsx("size-6 rounded-full", card.color === color && "ring-2 ring-chalk")}
                style={{ background: color }}
              />
            ))}
            <ImagePicker value={card.image} onChange={(image) => patch(card.id, { image })} />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...cards,
            {
              id: Math.random().toString(36).slice(2, 8),
              title: "new card",
              color: CUSTOM_COLORS[cards.length % CUSTOM_COLORS.length],
              copies: 1,
            },
          ])
        }
        className="flex min-h-8 w-full items-center justify-center gap-1 rounded-lg bg-white/6 text-[11px] text-muted"
      >
        <Plus className="size-3.5" /> a card
      </button>
    </div>
  );
}

function BackEditor({ deck, onChange }: { deck: DeckDef; onChange: (patch: Partial<DeckDef>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="pr-1 text-[10px] text-muted/60">back</span>
      {BACK_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange({ back: { ...deck.back, color, image: undefined } })}
          aria-label={`back colour ${color}`}
          className={clsx("size-6 rounded-md", deck.back.color === color && !deck.back.image && "ring-2 ring-chalk")}
          style={{ background: color }}
        />
      ))}
      {PATTERNS.map((pattern) => (
        <Chip
          key={pattern}
          on={deck.back.pattern === pattern && !deck.back.image}
          onClick={() => onChange({ back: { ...deck.back, pattern, image: undefined } })}
        >
          {pattern}
        </Chip>
      ))}
      <ImagePicker value={deck.back.image} onChange={(image) => onChange({ back: { ...deck.back, image } })} />
    </div>
  );
}

/** A picture from a link or from the device, through the room's own uploads. */
function ImagePicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (url: string | undefined) => void;
}) {
  const { uploadFile } = useRoom();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className={clsx(
          "flex min-h-8 items-center gap-1 rounded-lg px-2 text-[10px] transition",
          value ? "bg-glow/22 text-glow" : "bg-white/6 text-muted",
        )}
      >
        <ImagePlus className="size-3.5" />
        {busy ? "uploading" : value ? "picture set" : "picture"}
      </button>
      {value && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-label="no picture"
          className="grid size-8 place-items-center text-muted"
        >
          <X className="size-3.5" />
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="absolute size-px overflow-hidden opacity-0"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setBusy(true);
          const url = await uploadFile(file);
          setBusy(false);
          if (url) onChange(url);
        }}
      />
    </span>
  );
}
