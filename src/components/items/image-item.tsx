"use client";

import { useState } from "react";
import clsx from "clsx";
import { ImagePlus } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import type { Item } from "@/lib/types";

export default function ImageItem({
  item,
  selected,
}: {
  item: Item<"image">;
  selected: boolean;
}) {
  const { canEdit, updateData, uploadFile } = useRoom();
  const [broken, setBroken] = useState(false);
  const { url, frame = "shadow", radius = 10, alt } = item.data;

  if (!url) {
    return (
      <EmptySlot
        active={selected}
        onPick={async (file) => {
          const uploaded = await uploadFile(file);
          if (uploaded) await updateData(item.id, { ...item.data, url: uploaded });
        }}
        onUrl={async (value) => {
          await updateData(item.id, { ...item.data, url: value });
        }}
        canEdit={canEdit}
      />
    );
  }

  const polaroid = frame === "polaroid";

  return (
    <div
      className={clsx(
        "size-full overflow-hidden",
        polaroid && "bg-[#f6f2e8] p-2.5 pb-10 shadow-[0_16px_40px_-16px_rgb(0_0_0/0.75)]",
        frame === "shadow" && "shadow-[0_18px_46px_-18px_rgb(0_0_0/0.8)]",
        frame === "sticker" && "ring-4 ring-white/90 shadow-[0_10px_28px_-12px_rgb(0_0_0/0.7)]",
      )}
      style={{ borderRadius: polaroid ? 4 : radius }}
    >
      {broken ? (
        <div className="grid size-full place-items-center bg-ink-800 px-4 text-center text-xs text-muted">
          this image did not load
        </div>
      ) : (
        <img
          src={url}
          alt={alt ?? ""}
          draggable={false}
          onError={() => setBroken(true)}
          // A plain img (never next/image) keeps animated GIFs and WebPs playing;
          // the optimizer would flatten them to a single frame.
          loading="eager"
          decoding="async"
          className="size-full object-cover"
          style={{ borderRadius: polaroid ? 2 : radius }}
        />
      )}
      {polaroid && alt && (
        <p className="absolute inset-x-3 bottom-2 truncate text-center font-[family-name:var(--font-hand)] text-lg text-ink-900">
          {alt}
        </p>
      )}
    </div>
  );
}

function EmptySlot({
  active,
  canEdit,
  onPick,
  onUrl,
}: {
  active: boolean;
  canEdit: boolean;
  onPick: (file: File) => void | Promise<void>;
  onUrl: (url: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");

  return (
    <div
      className={clsx(
        "grid size-full place-items-center rounded-xl border-2 border-dashed p-4 text-center transition",
        active ? "border-glow/60 bg-ink-800/85" : "border-white/15 bg-ink-800/65",
      )}
    >
      {active && canEdit ? (
        <div className="w-full max-w-[240px] space-y-2">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-chalk px-3 py-2 text-xs font-semibold text-ink-950 transition hover:bg-white">
            <ImagePlus className="size-3.5" strokeWidth={2.4} />
            choose a file
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onPick(file);
              }}
            />
          </label>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (value.trim()) void onUrl(value.trim());
            }}
          >
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="or paste an image url"
              spellCheck={false}
              className="w-full rounded-xl bg-white/8 px-3 py-2 text-xs ring-1 ring-white/12 outline-none placeholder:text-muted/60 focus:ring-glow/50"
            />
          </form>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-muted">
          <ImagePlus className="size-5" strokeWidth={1.8} />
          <span className="text-xs">empty frame</span>
        </div>
      )}
    </div>
  );
}
