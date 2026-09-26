"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { PRESETS, presetOf, type StackRule, type UnoRules } from "@/lib/uno";
import { t } from "@/lib/i18n";

type Flag = { [K in keyof UnoRules]: UnoRules[K] extends boolean ? K : never }[keyof UnoRules];

const FLAGS: Array<{ group: string; items: Array<{ key: Flag; name: string; does: string }> }> = [
  {
    group: "how cards go down",
    items: [
      { key: "jumpIn", name: "cut in", does: "holding the exact card on top, slap it down out of turn; play carries on from you" },
      { key: "multiples", name: "pairs and more", does: "several of the same number go down together" },
      { key: "sevenO", name: "7-0", does: "a 7 swaps your hand with anyone's, a 0 passes every hand along" },
      { key: "forcePlay", name: "play if you can", does: "no drawing while you hold something that fits" },
      { key: "noActionFinish", name: "no going out on a special", does: "your last card has to be a number" },
    ],
  },
  {
    group: "drawing cards",
    items: [
      { key: "reflect", name: "send it back", does: "with a draw coming at you, a reverse bounces it back and a skip passes it on (needs stacking)" },
      { key: "drawUntil", name: "draw until you can play", does: "no drawing just one: keep going until something fits" },
      { key: "challenge", name: "challenge the +4", does: "a wild draw four can be a bluff; call it and whoever was wrong pays" },
      { key: "freeW4", name: "+4 whenever", does: "the wild draw four goes down even when you hold the colour" },
    ],
  },
  {
    group: "decks and modes",
    items: [
      { key: "mercy", name: "no mercy", does: "+4s in colour, +6, +10, colour roulette, skip everyone, discard all -- and 25 cards puts you out" },
      { key: "chaos", name: "chaos", does: "swap-hands wilds join the deck, and every few plays something happens that nobody asked for" },
    ],
  },
];

const STACKS: Array<{ id: StackRule; name: string }> = [
  { id: "off", name: "off" },
  { id: "same", name: "same card" },
  { id: "up", name: "same or bigger" },
  { id: "any", name: "anything" },
];

function Segment<T extends string | number>({ value, options, onChange, disabled }: { value: T; options: Array<{ id: T; name: string }>; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={clsx(
            "min-h-8 rounded-lg px-2.5 text-[11px] transition disabled:opacity-40",
            value === o.id ? "bg-chalk font-semibold text-ink-950" : "bg-white/6 text-muted hover:bg-white/10 hover:text-chalk",
          )}
        >
          {t(o.name)}
        </button>
      ))}
    </span>
  );
}

/**
 * The house rules, picked before a deal. A preset sets everything at once;
 * each switch after that makes it the table's own.
 */
export default function UnoHouse({
  rules,
  later,
  onChange,
  onClose,
}: {
  rules: UnoRules;
  /** Mid-round and changed: the round goes on as it was dealt. */
  later: boolean;
  onChange: (next: UnoRules) => void;
  onClose: () => void;
}) {
  const preset = presetOf(rules);
  const set = (patch: Partial<UnoRules>) => onChange({ ...rules, ...patch });

  return (
    <div className="absolute inset-0 z-30 flex flex-col rounded-2xl bg-ink-950/96 p-3 backdrop-blur-sm">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[12px] font-semibold text-chalk">{t("house rules")}</h3>
          <p className={clsx("truncate text-[10px]", later ? "text-warm" : "text-muted/70")}>{later ? t("this round keeps its rules -- these start with the next deal") : t("pick a set, then change whatever you like")}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t("close")} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk">
          <X className="size-4" strokeWidth={2.4} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              
              onClick={() => onChange(p.rules)}
              className={clsx(
                "rounded-xl px-2.5 py-2 text-left transition disabled:opacity-50",
                preset === p.id ? "bg-[#d63a3a]/25 ring-1 ring-[#d63a3a]/70" : "bg-white/5 hover:bg-white/9",
              )}
            >
              <span className="block text-[12px] font-semibold text-chalk">{t(p.name)}</span>
              <span className="mt-0.5 line-clamp-2 block text-[10px] leading-snug text-muted">{t(p.blurb)}</span>
            </button>
          ))}
        </div>

        <section className="space-y-1.5">
          <h4 className="text-[10px] font-semibold tracking-wide text-muted/70 uppercase">{t("stacking draws")}</h4>
          <Segment value={rules.stack} options={STACKS} onChange={(stack) => set({ stack, reflect: stack === "off" ? false : rules.reflect })}  />
        </section>

        {FLAGS.map((g) => (
          <section key={g.group} className="space-y-1">
            <h4 className="text-[10px] font-semibold tracking-wide text-muted/70 uppercase">{t(g.group)}</h4>
            {g.items.map((f) => {
              const on = rules[f.key];
              const blocked = (f.key === "reflect" && rules.stack === "off");
              return (
                <button
                  key={f.key}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  disabled={blocked}
                  onClick={() => set({ [f.key]: !on } as Partial<UnoRules>)}
                  className="flex w-full items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-white/5 disabled:opacity-45"
                >
                  <span className={clsx("mt-0.5 flex h-4.5 w-8 shrink-0 items-center rounded-full p-0.5 transition", on ? "bg-[#d63a3a]" : "bg-white/15")}>
                    <span className={clsx("size-3.5 rounded-full bg-white shadow transition", on && "translate-x-3.5")} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12px] text-chalk">{t(f.name)}</span>
                    <span className="block text-[10px] leading-snug text-muted">{t(f.does)}</span>
                  </span>
                </button>
              );
            })}
          </section>
        ))}

        <section className="space-y-2 pb-1">
          <h4 className="text-[10px] font-semibold tracking-wide text-muted/70 uppercase">{t("the round")}</h4>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-[11px] text-muted">{t("cards each")}</span>
            <Segment value={rules.hand} options={[5, 6, 7, 8, 10].map((n) => ({ id: n, name: String(n) }))} onChange={(hand) => set({ hand })}  />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-[11px] text-muted">{t("the round ends")}</span>
            <Segment
              value={rules.end}
              options={[
                { id: "first", name: "when someone goes out" },
                { id: "last", name: "when one is left" },
              ]}
              onChange={(end) => set({ end })}
              
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-[11px] text-muted">{t("clock")}</span>
            <Segment
              value={rules.timer}
              options={[
                { id: 0, name: "none" },
                { id: 10, name: "10s" },
                { id: 20, name: "20s" },
                { id: 30, name: "30s" },
              ]}
              onChange={(timer) => set({ timer })}
              
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-[11px] text-muted">{t("caught without calling uno")}</span>
            <Segment
              value={rules.unoPenalty}
              options={[
                { id: 2, name: "+2" },
                { id: 4, name: "+4" },
              ]}
              onChange={(unoPenalty) => set({ unoPenalty })}
              
            />
          </div>
        </section>
      </div>
    </div>
  );
}
