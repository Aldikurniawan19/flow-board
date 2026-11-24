import { pointToSegmentDistance } from './geometry.js';

/**
 * @typedef {{ x: number, y: number }} Pt
 * @typedef {{
 *   type: 'ellipse' | 'rectangle' | 'diamond' | 'triangle' | 'hexagon' | 'connector',
 *   label: string,
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   endMarker?: import('../types/schema.js').MarkerType
 * }} RecognizedShape
 */

/**
 * Compute total polyline length.
 * @param {Pt[]} pts
 * @returns {number}
 */
function computePathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

/**
 * Resample polyline to N equidistant points for consistent geometric analysis.
 * @param {Pt[]} pts
 * @param {number} count
 * @returns {Pt[]}
 */
function resamplePoints(pts, count) {
  const total = computePathLength(pts);
  if (total === 0 || pts.length < 2) return pts.slice();

  const step = total / (count - 1);
  /** @type {Pt[]} */
  const out = [pts[0]];
  let accum = 0;
  let prev = pts[0];

  for (let i = 1; i < pts.length; i += 1) {
    let curr = pts[i];
    let dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    while (accum + dist >= step && out.length < count) {
      const ratio = (step - accum) / dist;
      const nx = prev.x + ratio * (curr.x - prev.x);
      const ny = prev.y + ratio * (curr.y - prev.y);
      const nextPt = { x: nx, y: ny };
      out.push(nextPt);
      prev = nextPt;
      dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      accum = 0;
    }
    accum += dist;
    prev = curr;
  }

  while (out.length < count) {
    out.push(pts[pts.length - 1]);
  }
  return out;
}

/**
 * Ramer-Douglas-Peucker polyline simplification.
 * @param {Pt[]} pts
 * @param {number} epsilon
 * @returns {Pt[]}
 */
function simplifyRDP(pts, epsilon) {
  if (pts.length <= 2) return pts.slice();

  let maxDist = 0;
  let splitIdx = 0;
  const first = pts[0];
  const last = pts[pts.length - 1];

  for (let i = 1; i < pts.length - 1; i += 1) {
    const d = pointToSegmentDistance(pts[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      splitIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyRDP(pts.slice(0, splitIdx + 1), epsilon);
    const right = simplifyRDP(pts.slice(splitIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

/**
 * Compute axis-aligned bounding box of points.
 * @param {Pt[]} pts
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number, cx: number, cy: number }}
 */
function getBounds(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    cx: minX + width / 2,
    cy: minY + height / 2,
  };
}

/**
 * Compute unsigned area of a closed polygon via Shoelace formula.
 * @param {Pt[]} poly
 * @returns {number}
 */
function polygonArea(poly) {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Compute interior turn angle (in degrees, 0..180) at vertex b between a->b and b->c.
 * 180 means collinear/straight, 90 means right corner, 0 means full reversal.
 * @param {Pt} a
 * @param {Pt} b
 * @param {Pt} c
 * @returns {number}
 */
function cornerAngleDeg(a, b, c) {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const l1 = Math.hypot(v1x, v1y);
  const l2 = Math.hypot(v2x, v2y);
  if (l1 < 1e-6 || l2 < 1e-6) return 180;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Average distance from sampled points to the edges of a closed target polygon.
 * @param {Pt[]} samples
 * @param {Pt[]} poly
 * @returns {number}
 */
function meanDistToPolygon(samples, poly) {
  let total = 0;
  for (const s of samples) {
    let best = Infinity;
    for (let i = 0; i < poly.length; i += 1) {
      const d = pointToSegmentDistance(s, poly[i], poly[(i + 1) % poly.length]);
      if (d < best) best = d;
    }
    total += best;
  }
  return total / Math.max(1, samples.length);
}

/**
 * Measure normalized radial fit error to an axis-aligned ellipse inside bounds.
 * @param {Pt[]} samples
 * @param {{ cx: number, cy: number, width: number, height: number }} bounds
 * @returns {{ meanErr: number, maxErr: number }}
 */
function evaluateEllipseFit(samples, bounds) {
  const rx = Math.max(1, bounds.width / 2);
  const ry = Math.max(1, bounds.height / 2);
  let sumErr = 0;
  let maxErr = 0;

  for (const p of samples) {
    const nx = (p.x - bounds.cx) / rx;
    const ny = (p.y - bounds.cy) / ry;
    const err = Math.abs(Math.hypot(nx, ny) - 1);
    sumErr += err;
    if (err > maxErr) maxErr = err;
  }

  return {
    meanErr: sumErr / Math.max(1, samples.length),
    maxErr,
  };
}

/**
 * Check that points span around the center (prevents half-arcs or 'C' shapes matching circles).
 * @param {Pt[]} samples
 * @param {number} cx
 * @param {number} cy
 * @returns {number} Fraction of 8 angular octants covered (0..1)
 */
function angularCoverage(samples, cx, cy) {
  const octants = new Set();
  for (const p of samples) {
    const angle = Math.atan2(p.y - cy, p.x - cx);
    const bucket = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 8) % 8;
    octants.add(bucket);
  }
  return octants.size / 8;
}

/**
 * Clean simplified closed polygon by removing duplicate end vertex and near-collinear points.
 * @param {Pt[]} simplified
 * @param {number} minEdgeLen
 * @returns {Pt[]}
 */
function extractClosedCorners(simplified, minEdgeLen) {
  let pts = simplified.slice();
  if (pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < minEdgeLen) {
    pts = pts.slice(0, -1);
  }

  // Merge vertices that are too close
  /** @type {Pt[]} */
  const merged = [];
  for (const p of pts) {
    const prev = merged[merged.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= minEdgeLen) {
      merged.push(p);
    }
  }
  if (merged.length > 2 && Math.hypot(merged[0].x - merged[merged.length - 1].x, merged[0].y - merged[merged.length - 1].y) < minEdgeLen) {
    merged.pop();
  }

  // Drop nearly collinear vertices (turn angle > 152 deg)
  let changed = true;
  let current = merged;
  while (changed && current.length > 3) {
    changed = false;
    /** @type {Pt[]} */
    const next = [];
    for (let i = 0; i < current.length; i += 1) {
      const prev = current[(i - 1 + current.length) % current.length];
      const curr = current[i];
      const after = current[(i + 1) % current.length];
      const angle = cornerAngleDeg(prev, curr, after);
      if (angle > 152) {
        changed = true;
      } else {
        next.push(curr);
      }
    }
    current = next;
  }

  return current;
}

/**
 * Recognize a freehand pen stroke as a clean geometric diagram shape or connector.
 * Returns null for handwriting, small marks, or unrecognized scribbles.
 * @param {Pt[]} worldPoints
 * @returns {RecognizedShape | null}
 */
export function recognizeFreehandShape(worldPoints) {
  if (!worldPoints || worldPoints.length < 5) return null;

  const pathLen = computePathLength(worldPoints);
  if (pathLen < 36) return null;

  const bounds = getBounds(worldPoints);
  const maxDim = Math.max(bounds.width, bounds.height);
  const minDim = Math.min(bounds.width, bounds.height);
  const diag = Math.hypot(bounds.width, bounds.height);

  if (maxDim < 32) return null;

  const first = worldPoints[0];
  const last = worldPoints[worldPoints.length - 1];
  const endToEnd = Math.hypot(last.x - first.x, last.y - first.y);

  // 1. Open Straight Line check
  if (endToEnd / pathLen >= 0.92 && endToEnd >= 36) {
    let maxDev = 0;
    for (const p of worldPoints) {
      const d = pointToSegmentDistance(p, first, last);
      if (d > maxDev) maxDev = d;
    }
    if (maxDev <= Math.max(8, endToEnd * 0.08)) {
      return {
        type: 'connector',
        label: 'Garis Lurus',
        x: first.x,
        y: first.y,
        width: last.x - first.x,
        height: last.y - first.y,
        endMarker: 'none',
      };
    }
  }

  // 2. Closed shape requirement (guards against open letters like C, S, U, W)
  const isClosed = endToEnd <= Math.max(32, maxDim * 0.42);
  if (!isClosed || minDim < 20) return null;

  // Reject multi-loop scribbles (path shouldn't exceed ~1.7x reasonable perimeter)
  const bboxPerimeter = 2 * (bounds.width + bounds.height);
  if (pathLen > bboxPerimeter * 1.65 || pathLen < bboxPerimeter * 0.55) {
    return null;
  }

  const samples = resamplePoints(worldPoints, 64);
  if (angularCoverage(samples, bounds.cx, bounds.cy) < 0.875) {
    return null;
  }

  // Compute candidate shape fits
  const ellipseFit = evaluateEllipseFit(samples, bounds);

  const rectPoly = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
  const diamondPoly = [
    { x: bounds.cx, y: bounds.minY },
    { x: bounds.maxX, y: bounds.cy },
    { x: bounds.cx, y: bounds.maxY },
    { x: bounds.minX, y: bounds.cy },
  ];
  const triUpPoly = [
    { x: bounds.cx, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
  const hexInset = bounds.width * 0.24;
  const hexPoly = [
    { x: bounds.minX + hexInset, y: bounds.minY },
    { x: bounds.maxX - hexInset, y: bounds.minY },
    { x: bounds.maxX, y: bounds.cy },
    { x: bounds.maxX - hexInset, y: bounds.maxY },
    { x: bounds.minX + hexInset, y: bounds.maxY },
    { x: bounds.minX, y: bounds.cy },
  ];

  const normScale = Math.max(1, (bounds.width + bounds.height) / 4);
  const rectErr = meanDistToPolygon(samples, rectPoly) / normScale;
  const diamondErr = meanDistToPolygon(samples, diamondPoly) / normScale;
  const triErr = meanDistToPolygon(samples, triUpPoly) / normScale;
  const hexErr = meanDistToPolygon(samples, hexPoly) / normScale;

  const simplified = simplifyRDP(samples, Math.max(6, diag * 0.055));
  const corners = extractClosedCorners(simplified, Math.max(12, diag * 0.1));
  const polyArea = polygonArea(samples);
  const bboxArea = Math.max(1, bounds.width * bounds.height);
  const areaRatio = polyArea / bboxArea;

  // 3. Triangle (3 corners + strong triangle fit)
  if (corners.length === 3 && triErr < 0.14 && areaRatio >= 0.35 && areaRatio <= 0.62) {
    return {
      type: 'triangle',
      label: 'Segitiga',
      x: Math.round(bounds.minX),
      y: Math.round(bounds.minY),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };
  }

  // 4. Diamond vs Rectangle (4 sharp corners)
  if (corners.length === 4) {
    if (diamondErr < 0.14 && diamondErr < rectErr * 0.8 && diamondErr < ellipseFit.meanErr * 0.9 && areaRatio <= 0.65) {
      return {
        type: 'diamond',
        label: 'Belah Ketupat',
        x: Math.round(bounds.minX),
        y: Math.round(bounds.minY),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
    }
    if (rectErr < 0.14 && rectErr < ellipseFit.meanErr * 0.9 && areaRatio >= 0.72) {
      const nearSquare = minDim / maxDim >= 0.85;
      const w = nearSquare ? Math.round((bounds.width + bounds.height) / 2) : Math.round(bounds.width);
      const h = nearSquare ? w : Math.round(bounds.height);
      return {
        type: 'rectangle',
        label: nearSquare ? 'Persegi' : 'Persegi Panjang',
        x: Math.round(bounds.cx - w / 2),
        y: Math.round(bounds.cy - h / 2),
        width: w,
        height: h,
      };
    }
  }

  // 5. Hexagon (check before ellipse: 5-6 distinct corners whose straight edges beat ellipse fit)
  if (
    (corners.length === 5 || corners.length === 6) &&
    hexErr < 0.12 &&
    hexErr < ellipseFit.meanErr * 0.85 &&
    hexErr < rectErr * 0.85
  ) {
    return {
      type: 'hexagon',
      label: 'Segi Enam',
      x: Math.round(bounds.minX),
      y: Math.round(bounds.minY),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };
  }

  // 6. Circle / Ellipse (compare directly against polygon errors)
  const bestPolyErr = Math.min(rectErr, diamondErr, triErr);
  if (
    ellipseFit.meanErr < 0.135 &&
    ellipseFit.maxErr < 0.34 &&
    ellipseFit.meanErr <= bestPolyErr * 0.95 &&
    areaRatio >= 0.62 &&
    areaRatio <= 0.88
  ) {
    const nearCircle = minDim / maxDim >= 0.8;
    const w = nearCircle ? Math.round((bounds.width + bounds.height) / 2) : Math.round(bounds.width);
    const h = nearCircle ? w : Math.round(bounds.height);
    return {
      type: 'ellipse',
      label: nearCircle ? 'Lingkaran' : 'Elips',
      x: Math.round(bounds.cx - w / 2),
      y: Math.round(bounds.cy - h / 2),
      width: w,
      height: h,
    };
  }

  // 7. Fallback strong rectangle / diamond if RDP kept 5 points due to slight closure overlap
  if (rectErr < 0.11 && areaRatio >= 0.78) {
    const nearSquare = minDim / maxDim >= 0.85;
    const w = nearSquare ? Math.round((bounds.width + bounds.height) / 2) : Math.round(bounds.width);
    const h = nearSquare ? w : Math.round(bounds.height);
    return {
      type: 'rectangle',
      label: nearSquare ? 'Persegi' : 'Persegi Panjang',
      x: Math.round(bounds.cx - w / 2),
      y: Math.round(bounds.cy - h / 2),
      width: w,
      height: h,
    };
  }
  if (diamondErr < 0.11 && areaRatio >= 0.4 && areaRatio <= 0.62) {
    return {
      type: 'diamond',
      label: 'Belah Ketupat',
      x: Math.round(bounds.minX),
      y: Math.round(bounds.minY),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };
  }

  return null;
}
