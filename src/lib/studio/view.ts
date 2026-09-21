// Where the picture sits on the screen, and the free transform's box. Both
// are 2D affine matrices in the order a canvas takes them: [a, b, c, d, e, f]
// maps (x, y) to (a x + c y + e, b x + d y + f).

export type Mat = [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** How the picture is shown: moved, zoomed, turned and maybe mirrored. None of it changes the picture. */
export interface View {
  x: number;
  y: number;
  zoom: number;
  /** Radians. */
  rot: number;
  flip: boolean;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 32;

export function viewMatrix(v: View): Mat {
  const cos = Math.cos(v.rot);
  const sin = Math.sin(v.rot);
  const sx = v.zoom * (v.flip ? -1 : 1);
  const sy = v.zoom;
  return [cos * sx, sin * sx, -sin * sy, cos * sy, v.x, v.y];
}

export const applyMat = (m: Mat | number[], x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export function invert(m: Mat | number[]): Mat {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

/** `a` after `b`: the matrix that does b, then a. */
export function multiply(a: Mat | number[], b: Mat | number[]): Mat {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/** A screen point, in the picture's pixels. */
export const toDoc = (v: View, sx: number, sy: number) => applyMat(invert(viewMatrix(v)), sx, sy);

/** The same view, moved so a point of the picture lands on a point of the screen. */
export function pin(v: View, docX: number, docY: number, screenX: number, screenY: number): View {
  const m = viewMatrix({ ...v, x: 0, y: 0 });
  const [px, py] = applyMat(m, docX, docY);
  return { ...v, x: screenX - px, y: screenY - py };
}

/** The whole picture, as big as fits, in the middle. */
export function fit(doc: { w: number; h: number }, vw: number, vh: number, rot = 0, flip = false): View {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(vw / doc.w, vh / doc.h) * 0.92));
  return pin({ x: 0, y: 0, zoom, rot, flip }, doc.w / 2, doc.h / 2, vw / 2, vh / 2);
}

/** Zoomed by a factor, keeping the point under the cursor where it is. */
export function zoomAt(v: View, factor: number, sx: number, sy: number): View {
  const [dx, dy] = toDoc(v, sx, sy);
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
  return pin({ ...v, zoom }, dx, dy, sx, sy);
}

/** Turned about a point of the screen. */
export function rotateAt(v: View, radians: number, sx: number, sy: number): View {
  const [dx, dy] = toDoc(v, sx, sy);
  return pin({ ...v, rot: v.rot + radians }, dx, dy, sx, sy);
}

// ---------------------------------------------------------------------------
// The free transform
// ---------------------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A transform in progress: moved, scaled about the box's middle, and turned. */
export interface Warp {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  rot: number;
}

export const NO_WARP: Warp = { tx: 0, ty: 0, sx: 1, sy: 1, rot: 0 };

export function warpMatrix(box: Box, p: Warp): Mat {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const cos = Math.cos(p.rot);
  const sin = Math.sin(p.rot);
  // T(c + t) . R . S . T(-c)
  const a = cos * p.sx;
  const b = sin * p.sx;
  const c = -sin * p.sy;
  const d = cos * p.sy;
  return [a, b, c, d, cx + p.tx - (a * cx + c * cy), cy + p.ty - (b * cx + d * cy)];
}

/** The four corners of the box, transformed: top-left, top-right, bottom-right, bottom-left. */
export function warpCorners(box: Box, p: Warp): Array<[number, number]> {
  const m = warpMatrix(box, p);
  return [
    applyMat(m, box.x, box.y),
    applyMat(m, box.x + box.w, box.y),
    applyMat(m, box.x + box.w, box.y + box.h),
    applyMat(m, box.x, box.y + box.h),
  ];
}

/**
 * Scaling from a dragged corner: the corner follows the pointer, the middle
 * stays. `corner` says which one, as the signs of its x and y from the middle.
 */
export function scaleTo(box: Box, p: Warp, x: number, y: number, corner: [number, number], even: boolean): Warp {
  const cx = box.x + box.w / 2 + p.tx;
  const cy = box.y + box.h / 2 + p.ty;
  const cos = Math.cos(-p.rot);
  const sin = Math.sin(-p.rot);
  const lx = (x - cx) * cos - (y - cy) * sin;
  const ly = (x - cx) * sin + (y - cy) * cos;
  let sx = lx / (corner[0] * Math.max(1e-6, box.w / 2));
  let sy = ly / (corner[1] * Math.max(1e-6, box.h / 2));
  // A drag past the middle flips it; kept even, both sides grow alike.
  if (even) {
    const k = Math.max(Math.abs(sx), Math.abs(sy));
    sx = Math.sign(sx || 1) * k;
    sy = Math.sign(sy || 1) * k;
  }
  const floor = 0.01;
  return { ...p, sx: Math.abs(sx) < floor ? floor * Math.sign(sx || 1) : sx, sy: Math.abs(sy) < floor ? floor * Math.sign(sy || 1) : sy };
}
