// Zooming into one thing with two fingers, or the wheel.
//
// The view is a scale and an offset, applied as translate-then-scale from the
// top left. Whatever point sits under the fingers when a pinch starts stays
// under them as they move -- that is what makes it feel held.

export interface ZoomView {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

export const IDENTITY: ZoomView = { scale: 1, x: 0, y: 0 };

/** Kept inside the box: no zooming out past the whole thing, no dragging it off. */
export function clampView(view: ZoomView, box: Size): ZoomView {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.scale));
  const x = Math.min(0, Math.max(box.width - box.width * scale, view.x));
  const y = Math.min(0, Math.max(box.height - box.height * scale, view.y));
  return { scale, x, y };
}

/**
 * Zoomed by `factor` about a point in the box, keeping the content under that
 * point where it is.
 */
export function zoomAbout(view: ZoomView, factor: number, at: { x: number; y: number }, box: Size): ZoomView {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.scale * factor));
  const cx = (at.x - view.x) / view.scale;
  const cy = (at.y - view.y) / view.scale;
  return clampView({ scale, x: at.x - cx * scale, y: at.y - cy * scale }, box);
}

/**
 * Where a pinch has got to. `start` is the view when the fingers landed, with
 * their spread and midpoint then and now.
 */
export function pinchView(
  start: ZoomView,
  spreadThen: number,
  spreadNow: number,
  midThen: { x: number; y: number },
  midNow: { x: number; y: number },
  box: Size,
): ZoomView {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, start.scale * (spreadNow / Math.max(1, spreadThen))));
  // The point of the content that was under the fingers...
  const cx = (midThen.x - start.x) / start.scale;
  const cy = (midThen.y - start.y) / start.scale;
  // ...is kept under them, wherever they have moved to.
  return clampView({ scale, x: midNow.x - cx * scale, y: midNow.y - cy * scale }, box);
}
