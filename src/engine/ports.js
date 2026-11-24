const CONTAINER_TYPES = new Set(['frame', 'uml_boundary', 'uml_fragment']);

const ELLIPSE_TYPES = new Set([
  'ellipse',
  'uml_usecase',
  'dfd_yd_process',
  'erd_chen_attribute',
  'erd_chen_key_attr',
  'erd_chen_multi_attr',
  'erd_chen_derived_attr',
]);

const DIAMOND_TYPES = new Set([
  'diamond',
  'fc_decision',
  'erd_chen_relation',
  'erd_chen_id_relation',
]);

/**
 * Check whether an element can accept connector anchor ports.
 * @param {import('../types/schema.js').BoardElement} el
 * @returns {boolean}
 */
export function isConnectableElement(el) {
  return el.type !== 'connector' && el.type !== 'freehand';
}

/**
 * Compute normalized bounding rectangle for a shape element.
 * @param {import('../types/schema.js').BoardElement} el
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function getNormalizedRect(el) {
  const x = el.width >= 0 ? el.x : el.x + el.width;
  const y = el.height >= 0 ? el.y : el.y + el.height;
  return {
    x,
    y,
    width: Math.abs(el.width),
    height: Math.abs(el.height),
  };
}

/**
 * Return the 4 cardinal reference ports (top, right, bottom, left) of an element.
 * @param {import('../types/schema.js').BoardElement} el
 * @returns {Record<import('../types/schema.js').PortSide, { x: number, y: number }>}
 */
export function getShapePorts(el) {
  const r = getNormalizedRect(el);
  return {
    top: { x: r.x + r.width / 2, y: r.y },
    right: { x: r.x + r.width, y: r.y + r.height / 2 },
    bottom: { x: r.x + r.width / 2, y: r.y + r.height },
    left: { x: r.x, y: r.y + r.height / 2 },
  };
}

/**
 * Resolve a connector AnchorBinding to exact world coordinates on an element.
 * Supports continuous normalized (rx, ry) anchors and stays compatible with side-only bindings.
 * @param {import('../types/schema.js').BoardElement} el
 * @param {import('../types/schema.js').AnchorBinding} binding
 * @returns {{ x: number, y: number }}
 */
export function resolveBindingPoint(el, binding) {
  const r = getNormalizedRect(el);
  if (typeof binding.rx === 'number' && typeof binding.ry === 'number') {
    return {
      x: r.x + binding.rx * r.width,
      y: r.y + binding.ry * r.height,
    };
  }
  return getShapePorts(el)[binding.side];
}

/**
 * Return the outward unit normal vector for a port side.
 * @param {import('../types/schema.js').PortSide | null | undefined} side
 * @returns {{ x: number, y: number }}
 */
export function getPortNormal(side) {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'right':
      return { x: 1, y: 0 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

/**
 * Project a point onto line segment AB, returning the closest point and distance.
 * @param {{ x: number, y: number }} p
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 */
function closestPointOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) {
    return { x: a.x, y: a.y, dist: Math.hypot(p.x - a.x, p.y - a.y) };
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return { x, y, dist: Math.hypot(p.x - x, p.y - y) };
}

/**
 * Determine closest cardinal side for an anchor point inside/on a rectangle.
 * @param {number} rx
 * @param {number} ry
 * @returns {import('../types/schema.js').PortSide}
 */
function inferSideFromNormalized(rx, ry) {
  const dTop = ry;
  const dBottom = 1 - ry;
  const dLeft = rx;
  const dRight = 1 - rx;
  const min = Math.min(dTop, dBottom, dLeft, dRight);
  if (min === dTop) return 'top';
  if (min === dRight) return 'right';
  if (min === dBottom) return 'bottom';
  return 'left';
}

/**
 * Gently snap normalized coordinate to 0.5 only when cursor is very close to edge center.
 * @param {number} norm
 * @param {number} span
 * @param {number} snapPx
 * @returns {number}
 */
function softCenterSnap(norm, span, snapPx) {
  if (span <= 0) return norm;
  if (Math.abs((norm - 0.5) * span) <= snapPx) return 0.5;
  return norm;
}

/**
 * Project a world point onto any flexible attachment position on an element's perimeter
 * (or exact interior position when allowInterior is enabled).
 * @param {{ x: number, y: number }} point
 * @param {import('../types/schema.js').BoardElement} el
 * @param {{ threshold: number, allowInterior?: boolean, centerSnapPx?: number }} opts
 * @returns {{
 *   elementId: string,
 *   side: import('../types/schema.js').PortSide,
 *   rx: number,
 *   ry: number,
 *   point: { x: number, y: number },
 *   distance: number
 * } | null}
 */
export function projectPointToElementAnchor(point, el, opts) {
  const r = getNormalizedRect(el);
  if (r.width < 1 || r.height < 1) return null;

  const { threshold, allowInterior = false, centerSnapPx = 6 } = opts;

  const insideBox =
    point.x >= r.x &&
    point.x <= r.x + r.width &&
    point.y >= r.y &&
    point.y <= r.y + r.height;

  // Quick reject if outside inflated bounding box
  if (
    point.x < r.x - threshold ||
    point.x > r.x + r.width + threshold ||
    point.y < r.y - threshold ||
    point.y > r.y + r.height + threshold
  ) {
    return null;
  }

  // Allow free interior anchoring anywhere inside the element when Alt is held
  if (allowInterior && insideBox && !CONTAINER_TYPES.has(el.type)) {
    const rx = Math.max(0, Math.min(1, (point.x - r.x) / r.width));
    const ry = Math.max(0, Math.min(1, (point.y - r.y) / r.height));
    return {
      elementId: el.id,
      side: inferSideFromNormalized(rx, ry),
      rx,
      ry,
      point: { x: r.x + rx * r.width, y: r.y + ry * r.height },
      distance: 0,
    };
  }

  // Ellipse perimeter projection
  if (ELLIPSE_TYPES.has(el.type)) {
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const a = r.width / 2;
    const b = r.height / 2;
    let dx = point.x - cx;
    let dy = point.y - cy;
    if (Math.hypot(dx, dy) < 1e-4) {
      dx = a;
      dy = 0;
    }
    const angle = Math.atan2(dy / b, dx / a);
    let px = cx + a * Math.cos(angle);
    let py = cy + b * Math.sin(angle);
    const dist = Math.hypot(point.x - px, point.y - py);
    const insideEllipse = (dx / a) ** 2 + (dy / b) ** 2 <= 1;

    if (!insideEllipse && dist > threshold) return null;

    // Gentle snap to cardinal points on ellipse
    const cardinals = [
      { side: /** @type {const} */ ('top'), x: cx, y: r.y },
      { side: /** @type {const} */ ('right'), x: r.x + r.width, y: cy },
      { side: /** @type {const} */ ('bottom'), x: cx, y: r.y + r.height },
      { side: /** @type {const} */ ('left'), x: r.x, y: cy },
    ];
    for (const c of cardinals) {
      if (Math.hypot(px - c.x, py - c.y) <= centerSnapPx) {
        px = c.x;
        py = c.y;
        break;
      }
    }

    const rx = Math.max(0, Math.min(1, (px - r.x) / r.width));
    const ry = Math.max(0, Math.min(1, (py - r.y) / r.height));
    const side =
      Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle))
        ? Math.cos(angle) >= 0
          ? 'right'
          : 'left'
        : Math.sin(angle) >= 0
          ? 'bottom'
          : 'top';

    return {
      elementId: el.id,
      side,
      rx,
      ry,
      point: { x: px, y: py },
      distance: insideEllipse ? dist * 0.5 : dist,
    };
  }

  // Diamond perimeter projection (4 diagonal edges)
  if (DIAMOND_TYPES.has(el.type)) {
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const top = { x: cx, y: r.y };
    const right = { x: r.x + r.width, y: cy };
    const bottom = { x: cx, y: r.y + r.height };
    const left = { x: r.x, y: cy };
    const insideDiamond =
      Math.abs(point.x - cx) / (r.width / 2) + Math.abs(point.y - cy) / (r.height / 2) <= 1;

    const edges = [
      closestPointOnSegment(point, top, right),
      closestPointOnSegment(point, right, bottom),
      closestPointOnSegment(point, bottom, left),
      closestPointOnSegment(point, left, top),
    ];
    let best = edges[0];
    for (let i = 1; i < edges.length; i += 1) {
      if (edges[i].dist < best.dist) best = edges[i];
    }
    if (!insideDiamond && best.dist > threshold) return null;

    let px = best.x;
    let py = best.y;
    for (const v of [top, right, bottom, left]) {
      if (Math.hypot(px - v.x, py - v.y) <= centerSnapPx) {
        px = v.x;
        py = v.y;
        break;
      }
    }
    const rx = Math.max(0, Math.min(1, (px - r.x) / r.width));
    const ry = Math.max(0, Math.min(1, (py - r.y) / r.height));
    return {
      elementId: el.id,
      side: inferSideFromNormalized(rx, ry),
      rx,
      ry,
      point: { x: px, y: py },
      distance: insideDiamond ? best.dist * 0.5 : best.dist,
    };
  }

  // Rectangular / Table / DFD / UML / Arch perimeter projection (any point on all 4 sides)
  const tl = { x: r.x, y: r.y };
  const tr = { x: r.x + r.width, y: r.y };
  const br = { x: r.x + r.width, y: r.y + r.height };
  const bl = { x: r.x, y: r.y + r.height };

  /** @type {Array<{ side: import('../types/schema.js').PortSide, proj: { x: number, y: number, dist: number } }>} */
  const candidates = [
    { side: 'top', proj: closestPointOnSegment(point, tl, tr) },
    { side: 'right', proj: closestPointOnSegment(point, tr, br) },
    { side: 'bottom', proj: closestPointOnSegment(point, br, bl) },
    { side: 'left', proj: closestPointOnSegment(point, bl, tl) },
  ];

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    if (candidates[i].proj.dist < best.proj.dist) {
      best = candidates[i];
    }
  }

  // Containers (frame / uml_boundary / uml_fragment) only snap near their outer border
  if (CONTAINER_TYPES.has(el.type) && best.proj.dist > threshold) {
    return null;
  }
  if (!insideBox && best.proj.dist > threshold) {
    return null;
  }

  let rx = Math.max(0, Math.min(1, (best.proj.x - r.x) / r.width));
  let ry = Math.max(0, Math.min(1, (best.proj.y - r.y) / r.height));

  if (best.side === 'top' || best.side === 'bottom') {
    rx = softCenterSnap(rx, r.width, centerSnapPx);
    ry = best.side === 'top' ? 0 : 1;
  } else {
    ry = softCenterSnap(ry, r.height, centerSnapPx);
    rx = best.side === 'left' ? 0 : 1;
  }

  return {
    elementId: el.id,
    side: best.side,
    rx,
    ry,
    point: { x: r.x + rx * r.width, y: r.y + ry * r.height },
    distance: insideBox ? best.proj.dist * 0.5 : best.proj.dist,
  };
}

/**
 * Find the nearest flexible anchor point on any connectable element within threshold.
 * Prioritizes topmost elements and allows attaching anywhere along a component's perimeter
 * (or interior when allowInterior is true).
 * @param {{ x: number, y: number }} point
 * @param {import('../types/schema.js').BoardElement[]} elements
 * @param {Set<string>} [excludeIds]
 * @param {number} [threshold]
 * @param {{ allowInterior?: boolean, centerSnapPx?: number }} [options]
 * @returns {{
 *   elementId: string,
 *   side: import('../types/schema.js').PortSide,
 *   rx: number,
 *   ry: number,
 *   point: { x: number, y: number },
 *   distance: number
 * } | null}
 */
export function findNearestPort(
  point,
  elements,
  excludeIds = new Set(),
  threshold = 22,
  options = {},
) {
  /** @type {ReturnType<typeof projectPointToElementAnchor>} */
  let best = null;

  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i];
    if (!isConnectableElement(el) || excludeIds.has(el.id)) continue;

    const anchor = projectPointToElementAnchor(point, el, {
      threshold,
      allowInterior: options.allowInterior,
      centerSnapPx: options.centerSnapPx,
    });
    if (!anchor) continue;

    if (!best || anchor.distance < best.distance) {
      best = anchor;
    }
  }

  return best;
}
