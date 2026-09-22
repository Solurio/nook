// Reading a pointer inside something the room has moved.
//
// Every item on the table sits under the room's zoom and its own little tilt,
// so the box an element occupies on screen is not the box the element thinks
// it has: a rectangle turned two degrees has a wider bounding box than the
// element itself, and a point measured against that box lands somewhere else.
// The browser already does this properly for offsetX and offsetY, which are
// measured in the target's own pixels, through whatever transforms are in the
// way. Once a drag captures the pointer every event has the same target, so
// that is what these use.

export interface PointerLike {
  clientX: number;
  clientY: number;
  target?: EventTarget | null;
  offsetX?: number;
  offsetY?: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Where a pointer is inside an element, in that element's own pixels. */
export function pointIn(node: HTMLElement, event: PointerLike): Point {
  if (event.target === node && typeof event.offsetX === "number" && typeof event.offsetY === "number") {
    return { x: event.offsetX, y: event.offsetY };
  }
  // Nothing captured it: the box is the best guess, and it is right whenever
  // the thing is not turned.
  const rect = node.getBoundingClientRect();
  const kx = rect.width ? node.clientWidth / rect.width : 1;
  const ky = rect.height ? node.clientHeight / rect.height : 1;
  return { x: (event.clientX - rect.left) * kx, y: (event.clientY - rect.top) * ky };
}

/** How far one element sits inside another, in layout pixels. */
export function offsetWithin(node: HTMLElement, root: HTMLElement): Point {
  let x = 0;
  let y = 0;
  let at: HTMLElement | null = node;
  while (at && at !== root) {
    x += at.offsetLeft;
    y += at.offsetTop;
    at = at.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/**
 * Where a pointer is inside a box, as a fraction of it across and down, when
 * the pointer is being followed from somewhere else in the same item.
 */
export function fractionIn(root: HTMLElement, box: HTMLElement, event: PointerLike): Point {
  const at = pointIn(root, event);
  const corner = offsetWithin(box, root);
  return {
    x: (at.x - corner.x) / (box.clientWidth || 1),
    y: (at.y - corner.y) / (box.clientHeight || 1),
  };
}
