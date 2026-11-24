import { getNormalizedRect } from './ports.js';
import { computeConnectorPath } from './router.js';

/**
 * @typedef {'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'} ResizeHandle
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 */

/**
 * Compute bounding rectangle for any element (shape, freehand, or connector).
 * @param {import('../types/schema.js').BoardElement} el
 * @param {Map<string, import('../types/schema.js').BoardElement>} [elementsById]
 * @returns {Rect}
 */
export function getElementBounds(el, elementsById = new Map()) {
  if (el.type === 'freehand' && el.points && el.points.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of el.points) {
      const wx = el.x + p.x;
      const wy = el.y + p.y;
      if (wx < minX) minX = wx;
      if (wy < minY) minY = wy;
      if (wx > maxX) maxX = wx;
      if (wy > maxY) maxY = wy;
    }
    return {
      x: minX,
      y: minY,
      width: Math.max(4, maxX - minX),
      height: Math.max(4, maxY - minY),
    };
  }

  if (el.type === 'connector') {
    const path = computeConnectorPath(el, elementsById);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of path.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      x: minX,
      y: minY,
      width: Math.max(4, maxX - minX),
      height: Math.max(4, maxY - minY),
    };
  }

  return getNormalizedRect(el);
}

/**
 * Distance from a point to a line segment.
 * @param {{ x: number, y: number }} p
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {number}
 */
export function pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/**
 * Test if a world point intersects an element.
 * @param {{ x: number, y: number }} point
 * @param {import('../types/schema.js').BoardElement} el
 * @param {Map<string, import('../types/schema.js').BoardElement>} elementsById
 * @param {number} [tolerance]
 * @returns {boolean}
 */
export function hitTestElement(point, el, elementsById, tolerance = 8) {
  if (el.type === 'connector') {
    const path = computeConnectorPath(el, elementsById);
    for (let i = 0; i < path.points.length - 1; i += 1) {
      if (pointToSegmentDistance(point, path.points[i], path.points[i + 1]) <= tolerance) {
        return true;
      }
    }
    return false;
  }

  if (el.type === 'freehand' && el.points && el.points.length > 0) {
    const strokeTol = Math.max(tolerance, el.strokeWidth * 2);
    if (el.points.length === 1) {
      return Math.hypot(point.x - (el.x + el.points[0].x), point.y - (el.y + el.points[0].y)) <= strokeTol;
    }
    for (let i = 0; i < el.points.length - 1; i += 1) {
      const a = { x: el.x + el.points[i].x, y: el.y + el.points[i].y };
      const b = { x: el.x + el.points[i + 1].x, y: el.y + el.points[i + 1].y };
      if (pointToSegmentDistance(point, a, b) <= strokeTol) {
        return true;
      }
    }
    return false;
  }

  const r = getNormalizedRect(el);
  if (el.type === 'frame' || el.type === 'uml_boundary' || el.type === 'uml_fragment') {
    const nearLeft = Math.abs(point.x - r.x) <= tolerance && point.y >= r.y - tolerance && point.y <= r.y + r.height + tolerance;
    const nearRight = Math.abs(point.x - (r.x + r.width)) <= tolerance && point.y >= r.y - tolerance && point.y <= r.y + r.height + tolerance;
    const nearTop = Math.abs(point.y - r.y) <= 28 && point.x >= r.x - tolerance && point.x <= r.x + r.width + tolerance;
    const nearBottom = Math.abs(point.y - (r.y + r.height)) <= tolerance && point.x >= r.x - tolerance && point.x <= r.x + r.width + tolerance;
    return nearLeft || nearRight || nearTop || nearBottom;
  }

  return (
    point.x >= r.x - 2 &&
    point.x <= r.x + r.width + 2 &&
    point.y >= r.y - 2 &&
    point.y <= r.y + r.height + 2
  );
}

/**
 * Find the topmost element at a world point.
 * @param {{ x: number, y: number }} point
 * @param {import('../types/schema.js').BoardElement[]} elements
 * @param {Map<string, import('../types/schema.js').BoardElement>} elementsById
 * @param {number} [tolerance]
 * @returns {import('../types/schema.js').BoardElement | null}
 */
export function findTopmostElementAtPoint(point, elements, elementsById, tolerance = 8) {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    if (hitTestElement(point, elements[i], elementsById, tolerance)) {
      return elements[i];
    }
  }
  return null;
}

/**
 * Check whether two rectangles intersect (used for marquee selection).
 * @param {Rect} a
 * @param {Rect} b
 * @returns {boolean}
 */
export function rectsIntersect(a, b) {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

/**
 * Compute world positions of the 8 resize handles for a bounding rect.
 * @param {Rect} rect
 * @returns {Array<{ id: ResizeHandle, x: number, y: number, cursor: string }>}
 */
export function getResizeHandles(rect) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return [
    { id: 'nw', x: rect.x, y: rect.y, cursor: 'nwse-resize' },
    { id: 'n', x: cx, y: rect.y, cursor: 'ns-resize' },
    { id: 'ne', x: rect.x + rect.width, y: rect.y, cursor: 'nesw-resize' },
    { id: 'e', x: rect.x + rect.width, y: cy, cursor: 'ew-resize' },
    { id: 'se', x: rect.x + rect.width, y: rect.y + rect.height, cursor: 'nwse-resize' },
    { id: 's', x: cx, y: rect.y + rect.height, cursor: 'ns-resize' },
    { id: 'sw', x: rect.x, y: rect.y + rect.height, cursor: 'nesw-resize' },
    { id: 'w', x: rect.x, y: cy, cursor: 'ew-resize' },
  ];
}

/**
 * Hit test resize handles for a selected element bounds.
 * @param {{ x: number, y: number }} worldPoint
 * @param {Rect} rect
 * @param {number} zoom
 * @returns {ResizeHandle | null}
 */
export function hitTestResizeHandle(worldPoint, rect, zoom) {
  const radius = 8 / zoom;
  for (const h of getResizeHandles(rect)) {
    if (Math.abs(worldPoint.x - h.x) <= radius && Math.abs(worldPoint.y - h.y) <= radius) {
      return h.id;
    }
  }
  return null;
}

/**
 * Apply a resize handle delta to an element rectangle with minimum dimensions.
 * @param {Rect} initial
 * @param {ResizeHandle} handle
 * @param {number} dx
 * @param {number} dy
 * @param {number} [minSize]
 * @returns {Rect}
 */
export function applyResize(initial, handle, dx, dy, minSize = 24) {
  let { x, y, width, height } = initial;

  if (handle.includes('e')) {
    width = Math.max(minSize, initial.width + dx);
  }
  if (handle.includes('s')) {
    height = Math.max(minSize, initial.height + dy);
  }
  if (handle.includes('w')) {
    const nextW = Math.max(minSize, initial.width - dx);
    x = initial.x + (initial.width - nextW);
    width = nextW;
  }
  if (handle.includes('n')) {
    const nextH = Math.max(minSize, initial.height - dy);
    y = initial.y + (initial.height - nextH);
    height = nextH;
  }

  return { x, y, width, height };
}

/**
 * Compute Draw.io-style smart alignment guides when dragging a bounding box.
 * @param {Rect} movingRect
 * @param {Rect[]} otherRects
 * @param {number} [threshold]
 * @returns {{ dx: number, dy: number, guides: Array<{ axis: 'x' | 'y', pos: number, from: number, to: number }> }}
 */
export function computeAlignmentGuides(movingRect, otherRects, threshold = 6) {
  let bestDx = 0;
  let bestDistX = threshold + 1;
  /** @type {{ axis: 'x', pos: number, from: number, to: number } | null} */
  let guideX = null;

  let bestDy = 0;
  let bestDistY = threshold + 1;
  /** @type {{ axis: 'y', pos: number, from: number, to: number } | null} */
  let guideY = null;

  const mX = [movingRect.x, movingRect.x + movingRect.width / 2, movingRect.x + movingRect.width];
  const mY = [movingRect.y, movingRect.y + movingRect.height / 2, movingRect.y + movingRect.height];

  for (const other of otherRects) {
    const oX = [other.x, other.x + other.width / 2, other.x + other.width];
    const oY = [other.y, other.y + other.height / 2, other.y + other.height];

    for (const mx of mX) {
      for (const ox of oX) {
        const dist = Math.abs(ox - mx);
        if (dist <= threshold && dist < bestDistX) {
          bestDistX = dist;
          bestDx = ox - mx;
          guideX = {
            axis: 'x',
            pos: ox,
            from: Math.min(movingRect.y, other.y) - 16,
            to: Math.max(movingRect.y + movingRect.height, other.y + other.height) + 16,
          };
        }
      }
    }

    for (const my of mY) {
      for (const oy of oY) {
        const dist = Math.abs(oy - my);
        if (dist <= threshold && dist < bestDistY) {
          bestDistY = dist;
          bestDy = oy - my;
          guideY = {
            axis: 'y',
            pos: oy,
            from: Math.min(movingRect.x, other.x) - 16,
            to: Math.max(movingRect.x + movingRect.width, other.x + other.width) + 16,
          };
        }
      }
    }
  }

  /** @type {Array<{ axis: 'x' | 'y', pos: number, from: number, to: number }>} */
  const guides = [];
  if (guideX) guides.push(guideX);
  if (guideY) guides.push(guideY);

  return { dx: bestDx, dy: bestDy, guides };
}
