"use client";

import { useState } from "react";
import clsx from "clsx";
import { FILTERS, filterInfo, filterSettings, type FilterKind, type FilterParams } from "@/lib/studio/filters";
import { Panel, Range } from "./widgets";
import { t } from "@/lib/i18n";

export interface FilterChoice {
  kind: FilterKind;
  amount: number;
  params: FilterParams;
}

const GROUPS: Array<{ id: "adjust" | "blur" | "effect"; name: string }> = [
  { id: "adjust", name: "colour" },
  { id: "blur", name: "blur and sharpen" },
  { id: "effect", name: "effects" },
];

/**
 * Adjustments and filters change the pixels of the layer in hand -- only what
 * is selected, when something is. What they would do shows on the picture
 * while the panel is open; nothing is kept until "apply".
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
  onPreview: (filter: FilterChoice | null) => void;
  onApply: (filter: FilterChoice) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<FilterKind>("brightness");
  const [settings, setSettings] = useState<Record<string, Record<string, number | string>>>({});
  const info = filterInfo(kind);
  const values = settings[kind] ?? filterSettings(kind, NaN, undefined);

  const choiceOf = (k: FilterKind, v: Record<string, number | string>): FilterChoice => {
    const params: FilterParams = { ...v };
    delete params.amount;
    return { kind: k, amount: Number(v.amount ?? 0), params };
  };

  const choose = (next: FilterKind) => {
    setKind(next);
    onPreview(choiceOf(next, settings[next] ?? filterSettings(next, NaN, undefined)));
  };

  const change = (key: string, v: number | string) => {
    const next = { ...values, [key]: v };
    setSettings((s) => ({ ...s, [kind]: next }));
    onPreview(choiceOf(kind, next));
  };

  return (
    <Panel
      title={t("adjust and filters")}
      onClose={() => {
        onPreview(null);
        onClose();
      }}
      className="top-2 right-2 w-64"
    >
      <p className="mb-1.5 text-[10px] text-muted">{selected ? t("only inside the selection, on the layer in hand") : t("the whole layer in hand")}</p>
      {GROUPS.map((g) => (
        <div key={g.id} className="mb-2">
          <p className="mb-1 text-[9px] tracking-wide text-muted/60 uppercase">{t(g.name)}</p>
          <div className="grid grid-cols-2 gap-1">
            {FILTERS.filter((f) => f.group === g.id).map((f) => (
              <button
                key={f.kind}
                type="button"
                onClick={() => choose(f.kind)}
                className={clsx("min-h-7 truncate rounded-md px-2 text-left text-[11px]", f.kind === kind ? "bg-glow/25 text-glow" : "bg-white/5 text-muted hover:text-chalk")}
              >
                {t(f.name)}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="space-y-1.5 rounded-lg bg-white/4 p-1.5">
        <p className="text-[11px] font-semibold text-chalk">{t(info.name)}</p>
        {info.params.map((p) =>
          "color" in p ? (
            <label key={p.key} className="flex items-center gap-2 text-[10px] text-muted">
              <span className="w-20 shrink-0 truncate">{t(p.name)}</span>
              <input type="color" value={String(values[p.key])} onChange={(event) => change(p.key, event.target.value)} className="h-7 w-12 cursor-pointer rounded border-0 bg-transparent p-0" />
              <span className="text-chalk tabular-nums">{String(values[p.key])}</span>
            </label>
          ) : (
            <Range key={p.key} label={t(p.name)} value={Number(values[p.key])} min={p.min} max={p.max} step={p.step ?? 1} onChange={(v) => change(p.key, v)} />
          ),
        )}
        {!info.params.length && <p className="text-[10px] text-muted">{t("nothing to set: apply it as it is")}</p>}
      </div>

      <div className="mt-2 flex gap-1">
        <button type="button" onClick={() => onPreview(choiceOf(kind, values))} className="min-h-8 flex-1 rounded-lg bg-white/8 text-[11px] text-chalk hover:bg-white/12">{t("preview")}</button>
        <button
          type="button"
          onClick={() => {
            setSettings((s) => ({ ...s, [kind]: filterSettings(kind, NaN, undefined) }));
            onPreview(null);
          }}
          className="min-h-8 rounded-lg px-2 text-[11px] text-muted hover:bg-white/8 hover:text-chalk"
        >{t("reset")}</button>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => {
            onPreview(null);
            onApply(choiceOf(kind, values));
          }}
          className="min-h-8 flex-1 rounded-lg bg-glow/30 text-[11px] font-semibold text-glow hover:bg-glow/40 disabled:opacity-30"
        >{t("apply")}</button>
      </div>
    </Panel>
  );
}
