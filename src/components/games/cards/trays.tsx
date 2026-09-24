"use client";

import { useState } from "react";
import clsx from "clsx";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Eye,
  EyeOff,
  FlipVertical2,
  Hand as HandIcon,
  Layers,
  RotateCcw,
  Scissors,
  Send,
  Settings2,
  Shuffle,
  SplitSquareHorizontal,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { Stack } from "@/lib/table";
import { t } from "@/lib/i18n";

export function TrayButton({
  children,
  label,
  onClick,
  active,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex min-h-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[9px] font-medium transition disabled:opacity-35",
        active
          ? "bg-glow/22 text-glow"
          : danger
            ? "text-muted hover:bg-red-500/15 hover:text-red-300"
            : "text-muted hover:bg-white/8 hover:text-chalk active:bg-white/12",
      )}
    >
      {children}
      <span className="whitespace-nowrap">{t(label)}</span>
    </button>
  );
}

/** A little counter for how many to deal or draw at a time. */
export function Counter({ value, onChange, max = 26 }: { value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <span className="flex shrink-0 items-center rounded-lg bg-white/6">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} aria-label={t("one fewer")} className="grid size-7 place-items-center text-muted hover:text-chalk">
        -
      </button>
      <span className="min-w-4 text-center text-[11px] text-chalk tabular-nums">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label={t("one more")} className="grid size-7 place-items-center text-muted hover:text-chalk">
        +
      </button>
    </span>
  );
}

/** What you can do with the cards you have picked up out of your hand. */
export function HandActions({
  count,
  chairs,
  label,
  target,
  targetName,
  swapCount,
  onFaceUp,
  onFaceDown,
  onKeep,
  onOnto,
  onSwap,
  onGive,
  onClear,
}: {
  count: number;
  chairs: string[];
  label: (chair: string) => string;
  target: Stack | undefined;
  targetName: string;
  swapCount: number;
  onFaceUp: () => void;
  onFaceDown: () => void;
  onKeep: () => void;
  onOnto: (id: string) => void;
  onSwap: () => void;
  onGive: (chair: string) => void;
  onClear: () => void;
}) {
  const [giving, setGiving] = useState(false);
  const many = count > 1 ? `${count} cards` : "card";

  if (giving) {
    return (
      <>
        <span className="shrink-0 px-1 text-[10px] text-muted/70">{t("give the {many} to", { many: t(many) })}</span>
        {chairs.map((chair) => (
          <button
            key={chair}
            type="button"
            onClick={() => {
              onGive(chair);
              setGiving(false);
            }}
            className="min-h-9 shrink-0 rounded-lg bg-white/8 px-2.5 text-[11px] text-chalk"
          >
            {label(chair)}
          </button>
        ))}
        <button type="button" onClick={() => setGiving(false)} aria-label={t("never mind")} className="grid size-9 shrink-0 place-items-center text-muted">
          <X className="size-4" />
        </button>
      </>
    );
  }

  return (
    <>
      <span className="shrink-0 px-1 text-[10px] text-glow">{t("{count} in hand picked", { count })}</span>
      <TrayButton label={t("play face up")} onClick={onFaceUp}>
        <Eye className="size-4" />
      </TrayButton>
      <TrayButton label={t("play face down")} onClick={onFaceDown}>
        <EyeOff className="size-4" />
      </TrayButton>
      <TrayButton label={t("down, mine")} onClick={onKeep}>
        <HandIcon className="size-4" />
      </TrayButton>
      {target && swapCount === 0 && (
        <TrayButton label={t(`onto ${targetName}`)} onClick={() => onOnto(target.id)}>
          <Layers className="size-4" />
        </TrayButton>
      )}
      {target && swapCount > 0 && (
        <TrayButton label={t(`swap for ${swapCount}`)} onClick={onSwap}>
          <ArrowLeftRight className="size-4" />
        </TrayButton>
      )}
      {chairs.length > 0 && (
        <TrayButton label={t("give")} onClick={() => setGiving(true)}>
          <Send className="size-4" />
        </TrayButton>
      )}
      <TrayButton label={t("put down")} onClick={onClear}>
        <X className="size-4" />
      </TrayButton>
    </>
  );
}

/** What you can do with the stack you picked up. */
export function StackActions({
  stack,
  size,
  dealEach,
  setDealEach,
  canDraw,
  owned,
  peeking,
  chosen,
  onTake,
  onPeek,
  onDraw,
  onFlip,
  onTurnTop,
  onShuffle,
  onCut,
  onDeal,
  onSplit,
  onLayout,
  onTurn,
  onRename,
  onRemove,
}: {
  stack: Stack;
  size: number;
  dealEach: number;
  setDealEach: (n: number) => void;
  canDraw: boolean;
  owned: boolean;
  peeking: boolean;
  /** Cards picked out of a spread one by one. */
  chosen: number;
  onTake: () => void;
  onPeek: () => void;
  onDraw: () => void;
  onFlip: () => void;
  onTurnTop: () => void;
  onShuffle: () => void;
  onCut: () => void;
  onDeal: () => void;
  onSplit: () => void;
  onLayout: () => void;
  onTurn: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const down = stack.face === "down";
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(stack.label ?? "");

  if (naming) {
    return (
      <form
        className="flex min-w-0 flex-1 items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          onRename(name);
          setNaming(false);
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          autoFocus
          maxLength={24}
          placeholder={t("draw, discard, meld...")}
          className="h-9 min-w-0 flex-1 rounded-lg bg-white/8 px-2 text-[12px] ring-1 ring-white/12 outline-none focus:ring-glow/50"
        />
        <button type="submit" className="h-9 shrink-0 rounded-lg bg-glow/22 px-3 text-[11px] text-glow">{t("name it")}</button>
      </form>
    );
  }

  return (
    <>
      {chosen > 0 && canDraw && (
        <TrayButton label={t(`take ${chosen}`)} onClick={onTake}>
          <ArrowDownToLine className="size-4" />
        </TrayButton>
      )}
      {canDraw && size > 0 && chosen === 0 && (
        <>
          <TrayButton label={dealEach > 1 ? t(`draw ${dealEach}`) : t("to my hand")} onClick={onDraw}>
            <ArrowDownToLine className="size-4" />
          </TrayButton>
          <Counter value={dealEach} onChange={setDealEach} />
        </>
      )}
      {size > 0 && (
        <TrayButton label={down ? t("turn over") : t("turn down")} onClick={onFlip}>
          <FlipVertical2 className="size-4" />
        </TrayButton>
      )}
      {down && size > 1 && (
        <TrayButton label={t("top card up")} onClick={onTurnTop}>
          <Undo2 className="size-4" />
        </TrayButton>
      )}
      {owned && (
        <TrayButton label={peeking ? t("stop looking") : t("look")} active={peeking} onClick={onPeek}>
          <Eye className="size-4" />
        </TrayButton>
      )}
      {size > 1 && (
        <>
          <TrayButton label={t("shuffle")} onClick={onShuffle}>
            <Shuffle className="size-4" />
          </TrayButton>
          <TrayButton label={t("cut")} onClick={onCut}>
            <Scissors className="size-4" />
          </TrayButton>
          <TrayButton label={t("split")} onClick={onSplit}>
            <SplitSquareHorizontal className="size-4" />
          </TrayButton>
          <TrayButton label={t(`spread: ${stack.layout}`)} onClick={onLayout}>
            <Layers className="size-4" />
          </TrayButton>
        </>
      )}
      {down && size > 0 && (
        <TrayButton label={t(`deal ${dealEach} each`)} onClick={onDeal}>
          <Send className="size-4" />
        </TrayButton>
      )}
      <TrayButton label={t("turn round")} onClick={onTurn}>
        <RotateCcw className="size-4" />
      </TrayButton>
      <TrayButton label={t("name")} onClick={() => setNaming(true)}>
        <Settings2 className="size-4" />
      </TrayButton>
      {size === 0 && (
        <TrayButton label="remove" danger onClick={onRemove}>
          <Trash2 className="size-4" />
        </TrayButton>
      )}
    </>
  );
}
