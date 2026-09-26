"use client";

import { useEffect, useRef } from "react";
import { hexToRgb, hsvToHex, hsvToRgb, rgbToHex, rgbToHsv, svToTriangle, triangleCorners, triangleToSv, type HSV } from "@/lib/studio/color";

// The ways of picking a colour, each a different shape for the same three
// numbers: the ring with a square or a triangle inside, one big square with a
// hue bar, or plain sliders.

export type PickerMode = "square" | "triangle" | "box" | "sliders";

const MODE_KEY = "nook.studio.picker";

export function readPickerMode(): PickerMode {
  try {
    const saved = window.localStorage.getItem(MODE_KEY);
    if (saved === "square" || saved === "triangle" || saved === "box" || saved === "sliders") return saved;
  } catch {
    // Nothing saved, or nothing we may read.
  }
  return "square";
}

export function savePickerMode(mode: PickerMode) {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Remembered for this visit only.
  }
}

/** Pointer handling shared by every picker: capture on press, follow while held, measured against the element itself. */
function drag(onPoint: (x: number, y: number, box: DOMRect) => void) {
  const at = (event: React.PointerEvent) => onPoint(event.clientX, event.clientY, (event.currentTarget as Element).getBoundingClientRect());
  return {
    onPointerDown: (event: React.PointerEvent) => {
      event.stopPropagation();
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      at(event);
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (event.buttons) at(event);
    },
  };
}

/** How far in the ring's hole starts, as a share of the wheel's radius. */
const INNER = 0.62;

/** The hue ring, with a square or a triangle inside it for the rest. */
export function Wheel({ hsv, color, inner, onChange }: { hsv: HSV; color: string; inner: "square" | "triangle"; onChange: (next: HSV) => void }) {
  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const ring = drag((x, y, box) => {
    const a = Math.atan2(y - (box.top + box.height / 2), x - (box.left + box.width / 2));
    onChange({ ...hsv, h: ((a * 180) / Math.PI + 90 + 360) % 360 });
  });
  const square = drag((x, y, box) => {
    const s = Math.max(0, Math.min(1, (x - box.left) / box.width));
    const v = Math.max(0, Math.min(1, 1 - (y - box.top) / box.height));
    onChange({ ...hsv, s, v });
  });
  const hole = `radial-gradient(circle, transparent ${INNER * 100}%, black ${INNER * 100 + 1}%)`;
  return (
    <div className="relative mx-auto size-48">
      <div
        {...ring}
        className="absolute inset-0 cursor-pointer touch-none rounded-full"
        style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)", WebkitMask: hole, mask: hole }}
      />
      <span
        className="pointer-events-none absolute size-3.5 -translate-1/2 rounded-full border-2 border-white shadow"
        style={{ left: `${50 + 40.5 * Math.sin((hsv.h * Math.PI) / 180)}%`, top: `${50 - 40.5 * Math.cos((hsv.h * Math.PI) / 180)}%`, background: hueColor }}
      />
      {inner === "square" ? (
        <div
          {...square}
          className="absolute top-1/2 left-1/2 size-[42%] -translate-1/2 cursor-crosshair touch-none rounded"
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})` }}
        >
          <span className="pointer-events-none absolute size-3 -translate-1/2 rounded-full border-2 border-white shadow" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: color }} />
        </div>
      ) : (
        <TriangleIn hsv={hsv} color={color} onChange={onChange} />
      )}
    </div>
  );
}

/** The triangle's canvas, in CSS pixels, and its share of the wheel. */
const TRI_PX = 116;
const TRI_SHARE = 0.6;

/**
 * The triangle, drawn a pixel at a time: each point is its share of pure hue,
 * white and black. It turns with the hue so the pure corner always points at
 * the hue on the ring.
 */
function TriangleIn({ hsv, color, onChange }: { hsv: HSV; color: string; onChange: (next: HSV) => void }) {
  const R = TRI_PX / 2 - 1;
  const corners = triangleCorners(hsv.h, TRI_PX / 2, TRI_PX / 2, R);
  const pick = drag((x, y, box) => {
    const px = ((x - box.left) / box.width) * TRI_PX;
    const py = ((y - box.top) / box.height) * TRI_PX;
    onChange({ ...hsv, ...triangleToSv(px, py, corners) });
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const n = Math.round(TRI_PX * dpr);
    if (el.width !== n) {
      el.width = n;
      el.height = n;
    }
    const [[hx, hy], [wx, wy], [kx, ky]] = triangleCorners(hsv.h, n / 2, n / 2, R * dpr);
    const det = (wy - ky) * (hx - kx) + (kx - wx) * (hy - ky);
    const pure = hsvToRgb({ h: hsv.h, s: 1, v: 1 });
    const img = ctx.createImageData(n, n);
    const data = img.data;
    // Within this share of an edge, the pixel fades out instead of stopping dead.
    const soft = 1.2 / (R * dpr);
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const a = ((wy - ky) * (x + 0.5 - kx) + (kx - wx) * (y + 0.5 - ky)) / det;
        const b = ((ky - hy) * (x + 0.5 - kx) + (hx - kx) * (y + 0.5 - ky)) / det;
        const low = Math.min(a, b, 1 - a - b);
        if (low < -soft) continue;
        const i = (y * n + x) * 4;
        data[i] = pure.r * a + 255 * b;
        data[i + 1] = pure.g * a + 255 * b;
        data[i + 2] = pure.b * a + 255 * b;
        data[i + 3] = low >= 0 ? 255 : Math.round(255 * (1 + low / soft));
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [hsv.h, R, canvasRef]);

  const [mx, my] = svToTriangle(hsv.s, hsv.v, corners);
  return (
    <div className="absolute top-1/2 left-1/2 -translate-1/2" style={{ width: `${TRI_SHARE * 100}%`, height: `${TRI_SHARE * 100}%` }}>
      <canvas ref={canvasRef} {...pick} className="size-full cursor-crosshair touch-none" />
      <span
        className="pointer-events-none absolute size-3 -translate-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/30"
        style={{ left: `${(mx / TRI_PX) * 100}%`, top: `${(my / TRI_PX) * 100}%`, background: color }}
      />
    </div>
  );
}

/** A big square for strength and lightness, and a bar under it for the hue. */
export function Box({ hsv, color, onChange }: { hsv: HSV; color: string; onChange: (next: HSV) => void }) {
  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const area = drag((x, y, box) => {
    onChange({ ...hsv, s: Math.max(0, Math.min(1, (x - box.left) / box.width)), v: Math.max(0, Math.min(1, 1 - (y - box.top) / box.height)) });
  });
  const bar = drag((x, _y, box) => onChange({ ...hsv, h: Math.max(0, Math.min(359.9, ((x - box.left) / box.width) * 360)) }));
  return (
    <div className="space-y-2">
      <div
        {...area}
        className="relative h-40 w-full cursor-crosshair touch-none rounded-lg"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})` }}
      >
        <span className="pointer-events-none absolute size-3.5 -translate-1/2 rounded-full border-2 border-white shadow" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: color }} />
      </div>
      <div
        {...bar}
        className="relative h-4 w-full cursor-pointer touch-none rounded-full"
        style={{ background: "linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red)" }}
      >
        <span className="pointer-events-none absolute top-1/2 size-4 -translate-1/2 rounded-full border-2 border-white shadow" style={{ left: `${(hsv.h / 360) * 100}%`, background: hueColor }} />
      </div>
    </div>
  );
}

function Track({ label, value, max, background, onChange, suffix = "" }: { label: string; value: number; max: number; background: string; onChange: (v: number) => void; suffix?: string }) {
  const track = drag((x, _y, box) => onChange(Math.max(0, Math.min(max, ((x - box.left) / box.width) * max))));
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 text-[10px] font-semibold text-muted">{label}</span>
      <div {...track} className="relative h-3.5 flex-1 cursor-pointer touch-none rounded-full ring-1 ring-white/10" style={{ background }}>
        <span className="pointer-events-none absolute top-1/2 h-4.5 w-1.5 -translate-1/2 rounded-full bg-white shadow ring-1 ring-black/40" style={{ left: `${(value / max) * 100}%` }} />
      </div>
      <span className="w-9 text-right text-[10px] text-muted tabular-nums">
        {Math.round(value)}
        {suffix}
      </span>
    </div>
  );
}

/** Hue, strength and lightness, and red, green and blue, each on its own track. */
export function Sliders({ hsv, color, onChange, onColor }: { hsv: HSV; color: string; onChange: (next: HSV) => void; onColor: (hex: string) => void }) {
  const rgb = hexToRgb(color);
  const at = (patch: Partial<HSV>) => hsvToHex({ ...hsv, ...patch });
  const setRgb = (patch: Partial<typeof rgb>) => {
    const next = { ...rgb, ...patch };
    const asHsv = rgbToHsv(next);
    onChange(asHsv.s < 0.001 ? { ...asHsv, h: hsv.h } : asHsv);
    onColor(rgbToHex(next));
  };
  const channel = (key: "r" | "g" | "b") => `linear-gradient(to right, ${rgbToHex({ ...rgb, [key]: 0 })}, ${rgbToHex({ ...rgb, [key]: 255 })})`;
  return (
    <div className="space-y-1.5">
      <Track label="H" value={hsv.h} max={360} background="linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red)" onChange={(h) => onChange({ ...hsv, h: Math.min(359.9, h) })} suffix="°" />
      <Track label="S" value={hsv.s * 100} max={100} background={`linear-gradient(to right, ${at({ s: 0 })}, ${at({ s: 1 })})`} onChange={(v) => onChange({ ...hsv, s: v / 100 })} suffix="%" />
      <Track label="V" value={hsv.v * 100} max={100} background={`linear-gradient(to right, #000, ${at({ v: 1 })})`} onChange={(v) => onChange({ ...hsv, v: v / 100 })} suffix="%" />
      <div className="h-1" />
      <Track label="R" value={rgb.r} max={255} background={channel("r")} onChange={(r) => setRgb({ r })} />
      <Track label="G" value={rgb.g} max={255} background={channel("g")} onChange={(g) => setRgb({ g })} />
      <Track label="B" value={rgb.b} max={255} background={channel("b")} onChange={(b) => setRgb({ b })} />
    </div>
  );
}
