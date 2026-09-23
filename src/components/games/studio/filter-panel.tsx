"use client";

import { useState } from "react";
import clsx from "clsx";
import { FILTERS, type FilterKind } from "@/lib/studio/filters";
import { Panel, Range } from "./widgets";
import { t } from "@/lib/i18n";

/**
 * Filters change the pixels of the layer in hand -- only what is selected,
 * when something is. What they would do shows on the picture while the panel
 * is open; nothing is kept until "apply".
 */
export default function FilterPanel({
  selected,
  canEdit,
  onPreview,
  onApply,
  onClose,
}: {
  selected: boolean;
  canEdit: boolean;
  onPreview: (filter: { kind: FilterKind; amount: number } | null) => void;
  onApply: (kind: FilterKind, amount: number) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<FilterKind>("blur");
  const info = FILTERS.find((f) => f.kind === kind) ?? FILTERS[0];
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const amount = amounts[kind] ?? info.start;

  const choose = (next: FilterKind) => {
    setKind(next);
    const f = FILTERS.find((x) => x.kind === next) ?? FILTERS[0];
    onPreview({ kind: next, amount: amounts[next] ?? f.start });
  };

  return (
    <Panel
      title={t("filters")}
      onClose={() => {
        onPreview(null);
        onClose();
      }}
      className="top-2 right-2 w-64"
    >
      <p className="mb-1.5 text-[10px] text-muted">{selected ? t("only inside the selection, on the layer in hand") : t("the whole layer in hand")}</p>
      <div className="mb-2 grid grid-cols-2 gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.kind}
            type="button"
            onClick={() => choose(f.kind)}
            className={clsx("min-h-7 rounded-md px-2 text-left text-[11px]", f.kind === kind ? "bg-glow/25 text-glow" : "bg-white/5 text-muted hover:text-chalk")}
          >
            {t(f.name)}
          </button>
        ))}
      </div>
      {info.max > info.min && (
        <Range
          label={t("amount")}
          value={amount}
          min={info.min}
          max={info.max}
          onChange={(v) => {
            setAmounts((a) => ({ ...a, [kind]: v }));
            onPreview({ kind, amount: v });
          }}
        />
      )}
      <div className="mt-2 flex gap-1">
        <button type="button" onClick={() => onPreview({ kind, amount })} className="min-h-8 flex-1 rounded-lg bg-white/8 text-[11px] text-chalk hover:bg-white/12">{t("preview")}</button>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => {
            onPreview(null);
            onApply(kind, amount);
          }}
          className="min-h-8 flex-1 rounded-lg bg-glow/30 text-[11px] font-semibold text-glow hover:bg-glow/40 disabled:opacity-30"
        >{t("apply")}</button>
      </div>
    </Panel>
  );
}
