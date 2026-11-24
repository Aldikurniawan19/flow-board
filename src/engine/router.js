import { getPortNormal, resolveBindingPoint } from './ports.js';

const ELBOW_STUB = 28;

/**
 * Resolve start and end world points for a connector, honoring live flexible anchor bindings.
 * @param {import('../types/schema.js').BoardElement} connector
 * @param {Map<string, import('../types/schema.js').BoardElement>} elementsById
 * @returns {{
 *   start: { x: number, y: number },
 *   end: { x: number, y: number },
 *   startSide: import('../types/schema.js').PortSide | null,
 *   endSide: import('../types/schema.js').PortSide | null
 * }}
 */
export function resolveConnectorEndpoints(connector, elementsById) {
  let start = { x: connector.x, y: connector.y };
  let end = { x: connector.x + connector.width, y: connector.y + connector.height };
  /** @type {import('../types/schema.js').PortSide | null} */
  let startSide = null;
  /** @type {import('../types/schema.js').PortSide | null} */
  let endSide = null;

  if (connector.startBinding) {
    const target = elementsById.get(connector.startBinding.elementId);
    if (target) {
      start = resolveBindingPoint(target, connector.startBinding);
      startSide = connector.startBinding.side;
    }
  }

  if (connector.endBinding) {
    const target = elementsById.get(connector.endBinding.elementId);
    if (target) {
      end = resolveBindingPoint(target, connector.endBinding);
      endSide = connector.endBinding.side;
    }
  }

  return { start, end, startSide, endSide };
}

/**
 * Infer natural exit side when a connector endpoint is unbound.
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @returns {import('../types/schema.js').PortSide}
 */
function inferSide(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

/**
 * Remove consecutive duplicate or collinear points from a polyline.
 * @param {Array<{ x: number, y: number }>} pts
 * @returns {Array<{ x: number, y: number }>}
 */
function simplifyPolyline(pts) {
  /** @type {Array<{ x: number, y: number }>} */
  const deduped = [];
  for (const p of pts) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.5) {
      deduped.push(p);
    }
  }
  if (deduped.length <= 2) return deduped;

  /** @type {Array<{ x: number, y: number }>} */
  const result = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const a = result[result.length - 1];
    const b = deduped[i];
    const c = deduped[i + 1];
    const sameX = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5;
    const sameY = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5;
    if (!sameX && !sameY) {
      result.push(b);
    }
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}

/**
 * Compute an orthogonal 90-degree polyline between start and end respecting port normals.
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} end
 * @param {import('../types/schema.js').PortSide} sSide
 * @param {import('../types/schema.js').PortSide} eSide
 * @returns {Array<{ x: number, y: number }>}
 */
function buildElbowPoints(start, end, sSide, eSide) {
  const sNorm = getPortNormal(sSide);
  const eNorm = getPortNormal(eSide);

  const p1 = { x: start.x + sNorm.x * ELBOW_STUB, y: start.y + sNorm.y * ELBOW_STUB };
  const p2 = { x: end.x + eNorm.x * ELBOW_STUB, y: end.y + eNorm.y * ELBOW_STUB };

  const sHoriz = sSide === 'left' || sSide === 'right';
  const eHoriz = eSide === 'left' || eSide === 'right';

  if (sHoriz && eHoriz) {
    const facingEachOther =
      (sSide === 'right' && p2.x >= p1.x) || (sSide === 'left' && p2.x <= p1.x);
    if (facingEachOther) {
      const midX = (p1.x + p2.x) / 2;
      return simplifyPolyline([
        start,
        p1,
        { x: midX, y: p1.y },
        { x: midX, y: p2.y },
        p2,
        end,
      ]);
    }
    const midY = (start.y + end.y) / 2;
    return simplifyPolyline([
      start,
      p1,
      { x: p1.x, y: midY },
      { x: p2.x, y: midY },
      p2,
      end,
    ]);
  }

  if (!sHoriz && !eHoriz) {
    const facingEachOther =
      (sSide === 'bottom' && p2.y >= p1.y) || (sSide === 'top' && p2.y <= p1.y);
    if (facingEachOther) {
      const midY = (p1.y + p2.y) / 2;
      return simplifyPolyline([
        start,
        p1,
        { x: p1.x, y: midY },
        { x: p2.x, y: midY },
        p2,
        end,
      ]);
    }
    const midX = (start.x + end.x) / 2;
    return simplifyPolyline([
      start,
      p1,
      { x: midX, y: p1.y },
      { x: midX, y: p2.y },
      p2,
      end,
    ]);
  }

  if (sHoriz && !eHoriz) {
    const corner = { x: p2.x, y: p1.y };
    const forward =
      (sSide === 'right' && corner.x >= p1.x) || (sSide === 'left' && corner.x <= p1.x);
    if (forward) {
      return simplifyPolyline([start, p1, corner, p2, end]);
    }
    return simplifyPolyline([
      start,
      p1,
      { x: p1.x, y: p2.y },
      p2,
      end,
    ]);
  }

  const corner = { x: p1.x, y: p2.y };
  const forward =
    (sSide === 'bottom' && corner.y >= p1.y) || (sSide === 'top' && corner.y <= p1.y);
  if (forward) {
    return simplifyPolyline([start, p1, corner, p2, end]);
  }
  return simplifyPolyline([
    start,
    p1,
    { x: p2.x, y: p1.y },
    p2,
    end,
  ]);
}

/**
 * Evaluate a point on a cubic Bezier curve at parameter t in [0, 1].
 * @param {{ x: number, y: number }} p0
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {{ x: number, y: number }} p3
 * @param {number} t
 * @returns {{ x: number, y: number }}
 */
function evalCubicBezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

/**
 * Sample a smooth Catmull-Rom spline passing through all control vertices.
 * @param {Array<{ x: number, y: number }>} verts
 * @param {number} [segmentsPerSpan]
 * @returns {Array<{ x: number, y: number }>}
 */
function sampleCatmullRom(verts, segmentsPerSpan = 12) {
  if (verts.length <= 2) return verts.slice();
  /** @type {Array<{ x: number, y: number }>} */
  const out = [];
  for (let i = 0; i < verts.length - 1; i += 1) {
    const p0 = verts[Math.max(0, i - 1)];
    const p1 = verts[i];
    const p2 = verts[i + 1];
    const p3 = verts[Math.min(verts.length - 1, i + 2)];
    for (let s = 0; s < segmentsPerSpan; s += 1) {
      const t = s / segmentsPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(verts[verts.length - 1]);
  return out;
}

/**
 * Compute midpoint along a polyline by arc length.
 * @param {Array<{ x: number, y: number }>} pts
 * @returns {{ x: number, y: number }}
 */
function polylineMidpoint(pts) {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];

  let totalLen = 0;
  /** @type {number[]} */
  const segLens = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segLens.push(len);
    totalLen += len;
  }

  const half = totalLen / 2;
  let acc = 0;
  for (let i = 0; i < segLens.length; i += 1) {
    if (acc + segLens[i] >= half && segLens[i] > 0) {
      const ratio = (half - acc) / segLens[i];
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * ratio,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * ratio,
      };
    }
    acc += segLens[i];
  }
  return pts[Math.floor(pts.length / 2)];
}

/**
 * Build interactive corner handles and segment-midpoint insertion handles for a connector.
 * @param {Array<{ x: number, y: number }>} controlVertices [start, ...interiorCorners, end]
 * @param {boolean} hasCustomWaypoints
 */
function buildConnectorHandles(controlVertices, hasCustomWaypoints) {
  const cornerHandles = controlVertices.slice(1, -1).map((pt, index) => ({
    index,
    x: pt.x,
    y: pt.y,
    isCustom: hasCustomWaypoints,
  }));

  /** @type {Array<{ insertIndex: number, x: number, y: number }>} */
  const midpointHandles = [];
  for (let i = 0; i < controlVertices.length - 1; i += 1) {
    const a = controlVertices[i];
    const b = controlVertices[i + 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) >= 34) {
      midpointHandles.push({
        insertIndex: i,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      });
    }
  }

  return { cornerHandles, midpointHandles };
}

/**
 * Compute complete routing geometry for a connector element, supporting custom waypoints.
 * @param {import('../types/schema.js').BoardElement} connector
 * @param {Map<string, import('../types/schema.js').BoardElement>} elementsById
 */
export function computeConnectorPath(connector, elementsById) {
  const { start, end, startSide, endSide } = resolveConnectorEndpoints(connector, elementsById);
  const routing = connector.routing || 'elbow';
  const customWaypoints =
    connector.waypoints && connector.waypoints.length > 0 ? connector.waypoints : null;

  const labelPos = connector.labelPos || null;

  // Custom user-defined bend/corner waypoints take priority across all routing modes
  if (customWaypoints) {
    const controlVertices = [start, ...customWaypoints, end];
    const handles = buildConnectorHandles(controlVertices, true);

    if (routing === 'curved') {
      const sampled = sampleCatmullRom(controlVertices, 14);
      const p0 = sampled[0];
      const p1 = sampled[1] || end;
      const penult = sampled[sampled.length - 2] || start;
      const last = sampled[sampled.length - 1];
      return {
        routing,
        points: sampled,
        controlVertices,
        ...handles,
        startAngle: Math.atan2(p0.y - p1.y, p0.x - p1.x),
        endAngle: Math.atan2(last.y - penult.y, last.x - penult.x),
        labelPosition: labelPos || polylineMidpoint(sampled),
        cubic: null,
      };
    }

    const first = controlVertices[0];
    const second = controlVertices[1] || end;
    const penult = controlVertices[controlVertices.length - 2] || start;
    const last = controlVertices[controlVertices.length - 1];

    return {
      routing,
      points: controlVertices,
      controlVertices,
      ...handles,
      startAngle: Math.atan2(first.y - second.y, first.x - second.x),
      endAngle: Math.atan2(last.y - penult.y, last.x - penult.x),
      labelPosition: labelPos || polylineMidpoint(controlVertices),
      cubic: null,
    };
  }

  if (routing === 'straight') {
    const controlVertices = [start, end];
    const handles = buildConnectorHandles(controlVertices, false);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    return {
      routing,
      points: controlVertices,
      controlVertices,
      ...handles,
      startAngle: angle + Math.PI,
      endAngle: angle,
      labelPosition: labelPos || { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      cubic: null,
    };
  }

  const resolvedStartSide = startSide || inferSide(start, end);
  const resolvedEndSide = endSide || inferSide(end, start);

  if (routing === 'curved') {
    const dist = Math.max(40, Math.min(180, Math.hypot(end.x - start.x, end.y - start.y) * 0.45));
    const sNorm = getPortNormal(resolvedStartSide);
    const eNorm = getPortNormal(resolvedEndSide);
    const cp1 = { x: start.x + sNorm.x * dist, y: start.y + sNorm.y * dist };
    const cp2 = { x: end.x + eNorm.x * dist, y: end.y + eNorm.y * dist };

    /** @type {Array<{ x: number, y: number }>} */
    const sampled = [];
    const steps = 20;
    for (let i = 0; i <= steps; i += 1) {
      sampled.push(evalCubicBezier(start, cp1, cp2, end, i / steps));
    }
    const mid = evalCubicBezier(start, cp1, cp2, end, 0.5);

    return {
      routing,
      points: sampled,
      controlVertices: [start, end],
      cornerHandles: [],
      midpointHandles: [{ insertIndex: 0, x: mid.x, y: mid.y }],
      startAngle: Math.atan2(start.y - cp1.y, start.x - cp1.x),
      endAngle: Math.atan2(end.y - cp2.y, end.x - cp2.x),
      labelPosition: labelPos || mid,
      cubic: { start, cp1, cp2, end },
    };
  }

  const points = buildElbowPoints(start, end, resolvedStartSide, resolvedEndSide);
  const handles = buildConnectorHandles(points, false);
  const first = points[0];
  const second = points[1] || end;
  const penult = points[points.length - 2] || start;
  const last = points[points.length - 1];

  return {
    routing: 'elbow',
    points,
    controlVertices: points,
    ...handles,
    startAngle: Math.atan2(first.y - second.y, first.x - second.x),
    endAngle: Math.atan2(last.y - penult.y, last.x - penult.x),
    labelPosition: labelPos || polylineMidpoint(points),
    cubic: null,
  };
}
