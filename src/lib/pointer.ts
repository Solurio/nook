// Reading a pointer inside something the room has moved.
//
// Every item on the table sits under the room's zoom and its own little tilt,
// so the box an element takes up on screen is not the box the element thinks
// it has: a rectangle turned two degrees has a wider bounding box than the
// rectangle, and a point measured against that box lands somewhere else. What
// the room does is a turn and an even zoom, and both can be undone exactly.

export interface PointerLike {
  clientX: number;
  clientY: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * A point on the screen, in the pixels of an element that has been turned by
 * `rotation` degrees and zoomed evenly. The zoom is worked out from how much
 * wider the turned box is than the element itself.
 */
export function localPoint(box: Box, width: number, height: number, rotation: number, clientX: number, clientY: number): Point {
  const turn = (rotation * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const spread = width * Math.abs(cos) + height * Math.abs(sin);
  const zoom = spread > 0 && box.width > 0 ? box.width / spread : 1;
  const dx = clientX - (box.left + box.width / 2);
  const dy = clientY - (box.top + box.height / 2);
  return {
    x: (dx * cos + dy * sin) / zoom + width / 2,
    y: (-dx * sin + dy * cos) / zoom + height / 2,
  };
}

/** Where a pointer is inside an element, in that element's own pixels. */
export function pointIn(node: HTMLElement, event: PointerLike, rotation = 0): Point {
  return localPoint(node.getBoundingClientRect(), node.clientWidth, node.clientHeight, rotation, event.clientX, event.clientY);
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
export function fractionIn(root: HTMLElement, box: HTMLElement, event: PointerLike, rotation = 0): Point {
  const at = pointIn(root, event, rotation);
  const corner = offsetWithin(box, root);
  return {
    x: (at.x - corner.x) / (box.clientWidth || 1),
    y: (at.y - corner.y) / (box.clientHeight || 1),
  };
}
