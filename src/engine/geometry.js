import {
  getNormalizedRect,
  isConnectableElement,
  rotatePoint,
  rotatePortSide,
  unrotatePoint,
} from './ports.js';
import { computeConnectorPath } from './router.js';

/**
 * @typedef {'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'} ResizeHandle
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 */

/**
 * Estimate wrapped line count and widest line width for a connector label without requiring a Canvas 2D context.
 * Matches `drawConnectorLabel` parameters (maxWidth=158, padX=6, padY=3, lineHeight=1.28).
 * @param {string} rawText
 * @param {number} fontSize
 * @returns {{ width: number, height: number }}
 */
function estimateConnectorLabelSize(rawText, fontSize) {
  const maxWidth = 158;
  const charW = fontSize * 0.58;
  const maxCharsPerLine = Math.max(8, Math.floor(maxWidth / charW));
  const paragraphs = rawText.trim().split('\n');
  /** @type {string[]} */
  const lines = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const next = `${current} ${words[i]}`;
      if (next.length > maxCharsPerLine) {
        lines.push(current);
        current = words[i];
      } else {
        current = next;
      }
    }
    lines.push(current);
  }

  const maxLineChars = lines.reduce((m, l) => Math.max(m, l.length), 1);
  const textW = Math.min(maxWidth, maxLineChars * charW);
  const lineH = fontSize * 1.28;
  return {
    width: Math.max(28, textW + 12),
    height: Math.max(20, lines.length * lineH + 6),
  };
}

/**
 * Compute world-space bounding box of a connector's text label pill (or null if no label text).
 * @param {import('../types/schema.js').BoardElement} el
 * @param {Map<string, import('../types/schema.js').BoardElement>} [elementsById]
 * @returns {{ x: number, y: number, width: number, height: number, cx: number, cy: number } | null}
 */
export function getConnectorLabelRect(el, elementsById = new Map()) {
  if (el.type !== 'connector' || !el.text || !el.text.trim()) return null;
  const routed = computeConnectorPath(el, elementsById);
  if (routed.points.length < 2) return null;
  const fontSize = Math.min(el.fontSize || 11, 11.5);
  const { width, height } = estimateConnectorLabelSize(el.text, fontSize);
  const cx = routed.labelPosition.x;
  const cy = routed.labelPosition.y;
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
    cx,
    cy,
  };
}

/**
 * Find the topmost connector whose text label pill contains `point`.
 * @param {{ x: number, y: number }} point
 * @param {import('../types/schema.js').BoardElement[]} elements
 * @param {Map<string, import('../types/schema.js').BoardElement>} elementsById
 * @param {number} [padding]
 * @returns {import('../types/schema.js').BoardElement | null}
 */
export function findConnectorLabelAtPoint(point, elements, elementsById, padding = 4) {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i];
    if (el.type !== 'connector' || !el.text || !el.text.trim()) continue;
    const rect = getConnectorLabelRect(el, elementsById);
    if (!rect) continue;
    if (
      point.x >= rect.x - padding &&
      point.x <= rect.x + rect.width + padding &&
      point.y >= rect.y - padding &&
      point.y <= rect.y + rect.height + padding
    ) {
      return el;
    }
  }
  return null;
}

/**
 * Find the closest point along a polyline to a reference point (used for label tether guides).
 * @param {{ x: number, y: number }} point
 * @param {Array<{ x: number, y: number }>} pts
 * @returns {{ x: number, y: number, distance: number }}
 */
export function nearestPointOnPolyline(point, pts) {
  if (pts.length === 0) return { x: point.x, y: point.y, distance: 0 };
  if (pts.length === 1) {
    return { x: pts[0].x, y: pts[0].y, distance: Math.hypot(point.x - pts[0].x, point.y - pts[0].y) };
  }
  let bestX = pts[0].x;
  let bestY = pts[0].y;
  let bestDist = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const dist = Math.hypot(point.x - px, point.y - py);
    if (dist < bestDist) {
      bestDist = dist;
      bestX = px;
      bestY = py;
    }
  }
  return { x: bestX, y: bestY, distance: bestDist };
}

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
    const labelRect = getConnectorLabelRect(el, elementsById);
    if (labelRect) {
      if (labelRect.x < minX) minX = labelRect.x;
      if (labelRect.y < minY) minY = labelRect.y;
      if (labelRect.x + labelRect.width > maxX) maxX = labelRect.x + labelRect.width;
      if (labelRect.y + labelRect.height > maxY) maxY = labelRect.y + labelRect.height;
    }
    return {
      x: minX,
      y: minY,
      width: Math.max(4, maxX - minX),
      height: Math.max(4, maxY - minY),
    };
  }

  const r = getNormalizedRect(el);
  if (el.rotation) {
    const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    const corners = [
      rotatePoint({ x: r.x, y: r.y }, center, el.rotation),
      rotatePoint({ x: r.x + r.width, y: r.y }, center, el.rotation),
      rotatePoint({ x: r.x + r.width, y: r.y + r.height }, center, el.rotation),
      rotatePoint({ x: r.x, y: r.y + r.height }, center, el.rotation),
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of corners) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x > maxX) maxX = c.x;
      if (c.y > maxY) maxY = c.y;
    }
    return {
      x: minX,
      y: minY,
      width: Math.max(4, maxX - minX),
      height: Math.max(4, maxY - minY),
    };
  }
  return r;
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
    const labelRect = getConnectorLabelRect(el, elementsById);
    if (
      labelRect &&
      point.x >= labelRect.x - 4 &&
      point.x <= labelRect.x + labelRect.width + 4 &&
      point.y >= labelRect.y - 4 &&
      point.y <= labelRect.y + labelRect.height + 4
    ) {
      return true;
    }
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
  const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  const localPt = el.rotation ? unrotatePoint(point, center, el.rotation) : point;

  if (el.type === 'frame' || el.type === 'uml_boundary' || el.type === 'uml_fragment') {
    const nearLeft = Math.abs(localPt.x - r.x) <= tolerance && localPt.y >= r.y - tolerance && localPt.y <= r.y + r.height + tolerance;
    const nearRight = Math.abs(localPt.x - (r.x + r.width)) <= tolerance && localPt.y >= r.y - tolerance && localPt.y <= r.y + r.height + tolerance;
    const nearTop = Math.abs(localPt.y - r.y) <= 28 && localPt.x >= r.x - tolerance && localPt.x <= r.x + r.width + tolerance;
    const nearBottom = Math.abs(localPt.y - (r.y + r.height)) <= tolerance && localPt.x >= r.x - tolerance && localPt.x <= r.x + r.width + tolerance;
    return nearLeft || nearRight || nearTop || nearBottom;
  }

  return (
    localPt.x >= r.x - 2 &&
    localPt.x <= r.x + r.width + 2 &&
    localPt.y >= r.y - 2 &&
    localPt.y <= r.y + r.height + 2
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
 * Compute world positions of the 8 resize handles for a bounding rect (rotation-aware).
 * @param {Rect} rect
 * @param {number} [rotation]
 * @returns {Array<{ id: ResizeHandle, x: number, y: number, cursor: string }>}
 */
export function getResizeHandles(rect, rotation = 0) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const center = { x: cx, y: cy };
  /** @type {Array<{ id: ResizeHandle, x: number, y: number, cursor: string }>} */
  const raw = [
    { id: 'nw', x: rect.x, y: rect.y, cursor: 'nwse-resize' },
    { id: 'n', x: cx, y: rect.y, cursor: 'ns-resize' },
    { id: 'ne', x: rect.x + rect.width, y: rect.y, cursor: 'nesw-resize' },
    { id: 'e', x: rect.x + rect.width, y: cy, cursor: 'ew-resize' },
    { id: 'se', x: rect.x + rect.width, y: rect.y + rect.height, cursor: 'nwse-resize' },
    { id: 's', x: cx, y: rect.y + rect.height, cursor: 'ns-resize' },
    { id: 'sw', x: rect.x, y: rect.y + rect.height, cursor: 'nesw-resize' },
    { id: 'w', x: rect.x, y: cy, cursor: 'ew-resize' },
  ];
  if (!rotation) return raw;
  return raw.map((h) => {
    const p = rotatePoint(h, center, rotation);
    return { ...h, x: p.x, y: p.y };
  });
}

/**
 * Compute world position of the top-right corner rotation handle for a selected shape.
 * Positioned outside the NE corner so the top midpoint stays unobstructed for quick-connect arrows.
 * @param {Rect} rect
 * @param {number} zoom
 * @param {number} [rotation]
 * @returns {{ x: number, y: number, stemStart: { x: number, y: number } }}
 */
export function getRotationHandle(rect, zoom, rotation = 0) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const center = { x: cx, y: cy };
  const pad = 4 / zoom;
  const cornerDist = 18 / zoom;
  const localStem = { x: rect.x + rect.width + pad, y: rect.y - pad };
  const localKnob = { x: rect.x + rect.width + cornerDist, y: rect.y - cornerDist };
  const knob = rotation ? rotatePoint(localKnob, center, rotation) : localKnob;
  const stemStart = rotation ? rotatePoint(localStem, center, rotation) : localStem;
  return { x: knob.x, y: knob.y, stemStart };
}

/**
 * Compute world positions of the 4 Draw.io-style quick-connect block arrow handles
 * positioned outside each cardinal midpoint of a connectable shape (rotation-aware).
 * @param {import('../types/schema.js').BoardElement} el
 * @param {number} zoom
 * @returns {Array<{
 *   localSide: import('../types/schema.js').PortSide,
 *   side: import('../types/schema.js').PortSide,
 *   rx: number,
 *   ry: number,
 *   anchor: { x: number, y: number },
 *   x: number,
 *   y: number,
 *   angle: number
 * }>}
 */
export function getQuickConnectHandles(el, zoom) {
  if (!isConnectableElement(el)) return [];
  const r = getNormalizedRect(el);
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const center = { x: cx, y: cy };
  const rot = el.rotation || 0;
  const offset = 22 / zoom;

  const specs = [
    {
      localSide: /** @type {const} */ ('top'),
      rx: 0.5,
      ry: 0,
      localAnchor: { x: cx, y: r.y },
      localHandle: { x: cx, y: r.y - offset },
    },
    {
      localSide: /** @type {const} */ ('right'),
      rx: 1,
      ry: 0.5,
      localAnchor: { x: r.x + r.width, y: cy },
      localHandle: { x: r.x + r.width + offset, y: cy },
    },
    {
      localSide: /** @type {const} */ ('bottom'),
      rx: 0.5,
      ry: 1,
      localAnchor: { x: cx, y: r.y + r.height },
      localHandle: { x: cx, y: r.y + r.height + offset },
    },
    {
      localSide: /** @type {const} */ ('left'),
      rx: 0,
      ry: 0.5,
      localAnchor: { x: r.x, y: cy },
      localHandle: { x: r.x - offset, y: cy },
    },
  ];

  return specs.map((spec) => {
    const anchor = rot ? rotatePoint(spec.localAnchor, center, rot) : spec.localAnchor;
    const handle = rot ? rotatePoint(spec.localHandle, center, rot) : spec.localHandle;
    return {
      localSide: spec.localSide,
      side: rot ? rotatePortSide(spec.localSide, rot) : spec.localSide,
      rx: spec.rx,
      ry: spec.ry,
      anchor,
      x: handle.x,
      y: handle.y,
      angle: Math.atan2(handle.y - anchor.y, handle.x - anchor.x),
    };
  });
}

/**
 * Hit-test the 4 quick-connect block arrow handles around a shape.
 * @param {{ x: number, y: number }} worldPoint
 * @param {import('../types/schema.js').BoardElement} el
 * @param {number} zoom
 */
export function hitTestQuickConnectHandle(worldPoint, el, zoom) {
  if (!isConnectableElement(el) || el.locked) return null;
  const radius = 14 / zoom;
  for (const h of getQuickConnectHandles(el, zoom)) {
    if (Math.hypot(worldPoint.x - h.x, worldPoint.y - h.y) <= radius) {
      return h;
    }
  }
  return null;
}

/**
 * Check whether `worldPoint` lies inside the shape or within the smooth hover margin
 * leading out to its 4 quick-connect block arrows (prevents hover flicker while reaching an arrow).
 * @param {{ x: number, y: number }} worldPoint
 * @param {import('../types/schema.js').BoardElement} el
 * @param {number} zoom
 * @returns {boolean}
 */
export function isPointNearQuickConnectZone(worldPoint, el, zoom) {
  if (!isConnectableElement(el) || el.locked) return false;
  const r = getNormalizedRect(el);
  const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  const localPt = el.rotation ? unrotatePoint(worldPoint, center, el.rotation) : worldPoint;
  const pad = 40 / zoom;
  return (
    localPt.x >= r.x - pad &&
    localPt.x <= r.x + r.width + pad &&
    localPt.y >= r.y - pad &&
    localPt.y <= r.y + r.height + pad
  );
}

/**
 * Hit test the rotation knob above a selected shape.
 * @param {{ x: number, y: number }} worldPoint
 * @param {Rect} rect
 * @param {number} zoom
 * @param {number} [rotation]
 * @returns {boolean}
 */
export function hitTestRotationHandle(worldPoint, rect, zoom, rotation = 0) {
  const knob = getRotationHandle(rect, zoom, rotation);
  const radius = 12 / zoom;
  return Math.hypot(worldPoint.x - knob.x, worldPoint.y - knob.y) <= radius;
}

/**
 * Hit test resize handles for a selected element bounds (rotation-aware).
 * @param {{ x: number, y: number }} worldPoint
 * @param {Rect} rect
 * @param {number} zoom
 * @param {number} [rotation]
 * @returns {ResizeHandle | null}
 */
export function hitTestResizeHandle(worldPoint, rect, zoom, rotation = 0) {
  const radius = 8 / zoom;
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const localPt = rotation ? unrotatePoint(worldPoint, center, rotation) : worldPoint;
  for (const h of getResizeHandles(rect, 0)) {
    if (Math.abs(localPt.x - h.x) <= radius && Math.abs(localPt.y - h.y) <= radius) {
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
 * Apply a resize handle delta to a rotated element in its local coordinate frame
 * while keeping the opposite edge/corner pinned in world space.
 * @param {Rect} initial
 * @param {ResizeHandle} handle
 * @param {number} worldDx
 * @param {number} worldDy
 * @param {number} [rotation]
 * @param {number} [minSize]
 * @returns {Rect}
 */
export function applyResizeRotated(initial, handle, worldDx, worldDy, rotation = 0, minSize = 24) {
  if (!rotation) {
    return applyResize(initial, handle, worldDx, worldDy, minSize);
  }
  const rad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localDx = worldDx * cos - worldDy * sin;
  const localDy = worldDx * sin + worldDy * cos;

  const localResized = applyResize(initial, handle, localDx, localDy, minSize);
  const initCx = initial.x + initial.width / 2;
  const initCy = initial.y + initial.height / 2;
  const nextLocalCx = localResized.x + localResized.width / 2;
  const nextLocalCy = localResized.y + localResized.height / 2;

  const shiftLocalX = nextLocalCx - initCx;
  const shiftLocalY = nextLocalCy - initCy;

  // Rotate center shift back to world space so the opposite edge stays fixed
  const fwdRad = (rotation * Math.PI) / 180;
  const fCos = Math.cos(fwdRad);
  const fSin = Math.sin(fwdRad);
  const nextWorldCx = initCx + shiftLocalX * fCos - shiftLocalY * fSin;
  const nextWorldCy = initCy + shiftLocalX * fSin + shiftLocalY * fCos;

  return {
    x: nextWorldCx - localResized.width / 2,
    y: nextWorldCy - localResized.height / 2,
    width: localResized.width,
    height: localResized.height,
  };
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
