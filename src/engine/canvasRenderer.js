import rough from 'roughjs';
import getStroke from 'perfect-freehand';
import { FONT_FAMILY_MAP, GRID_SIZE, UI_TOKENS } from '../constants/tokens.js';
import { getElementBounds, getResizeHandles, getRotationHandle } from './geometry.js';
import { drawCanvasMarker } from './markers.js';
import { getNormalizedRect, getShapePorts, isConnectableElement } from './ports.js';
import { computeConnectorJumpPointsMap, computeConnectorPath } from './router.js';
import { applyStrokeDash, drawShapeElement, wrapTextLines } from './shapeRegistry.js';

/**
 * Convert perfect-freehand polygon points into a smooth SVG path string.
 * @param {number[][]} stroke
 * @returns {string}
 */
export function getSvgPathFromStroke(stroke) {
  if (!stroke.length) return '';
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q'],
  );
  d.push('Z');
  return d.join(' ');
}

/**
 * Render background grid (dots or lines) in screen space aligned with camera.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {import('./camera.js').Camera} camera
 * @param {import('../types/schema.js').GridMode} gridMode
 */
function drawGrid(ctx, width, height, camera, gridMode) {
  if (gridMode === 'none') return;

  const step = GRID_SIZE * camera.zoom;
  if (step < 8) return;

  const startX = ((camera.x % step) + step) % step;
  const startY = ((camera.y % step) + step) % step;

  ctx.save();
  if (gridMode === 'dots') {
    ctx.fillStyle = '#CBD5E1';
    for (let x = startX; x < width; x += step) {
      for (let y = startY; y < height; y += step) {
        ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
    }
  } else {
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = startY; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Render a freehand pen or highlighter stroke using perfect-freehand.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../types/schema.js').BoardElement} el
 */
export function drawFreehandElement(ctx, el) {
  if (!el.points || el.points.length === 0) return;
  const worldPts = el.points.map((p) => [el.x + p.x, el.y + p.y]);
  const stroke = getStroke(worldPts, {
    size: el.isHighlighter ? el.strokeWidth * 6 : el.strokeWidth * 2.2,
    thinning: el.isHighlighter ? 0 : 0.45,
    smoothing: 0.55,
    streamline: 0.5,
  });
  const pathData = getSvgPathFromStroke(stroke);
  if (!pathData) return;

  ctx.save();
  ctx.globalAlpha = el.isHighlighter ? Math.min(0.35, el.opacity) : el.opacity;
  ctx.fillStyle = el.strokeColor;
  ctx.fill(new Path2D(pathData));
  ctx.restore();
}

/**
 * Render a connector's label pill (drawn in a dedicated top pass so wires never slice through text).
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../types/schema.js').BoardElement} el
 * @param {Map<string, import('../types/schema.js').BoardElement>} elementsById
 */
export function drawConnectorLabel(ctx, el, elementsById) {
  if (!el.text || !el.text.trim()) return;
  const routed = computeConnectorPath(el, elementsById);
  if (routed.points.length < 2) return;

  ctx.save();
  ctx.globalAlpha = el.opacity;
  const fontSize = Math.min(el.fontSize || 11, 11.5);
  const family = FONT_FAMILY_MAP[el.fontFamily || 'sans'];
  ctx.setLineDash([]);
  ctx.font = `500 ${fontSize}px ${family}`;

  const lines = wrapTextLines(ctx, el.text.trim(), 158);
  const lineH = fontSize * 1.28;
  const maxLineW = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
  const padX = 6;
  const padY = 3;
  const boxW = maxLineW + padX * 2;
  const boxH = lines.length * lineH + padY * 2;
  const bx = routed.labelPosition.x - boxW / 2;
  const by = routed.labelPosition.y - boxH / 2;

  // Report-clean white knockout mask (Draw.io/Visio style, crisp text without cluttered box borders)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.beginPath();
  ctx.roundRect?.(bx, by, boxW, boxH, 3);
  if (!ctx.roundRect) ctx.rect(bx, by, boxW, boxH);
  ctx.fill();

  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, idx) => {
    const ly = by + padY + lineH / 2 + idx * lineH;
    ctx.fillText(line, routed.labelPosition.x, ly);
  });
  ctx.restore();
}

/**
 * Render a connector (straight, orthogonal elbow, or curved) with markers, sharp crossing jumps, and optional label.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../types/schema.js').BoardElement} el
 * @param {Map<string, import('../types/schema.js').BoardElement>} elementsById
 * @param {any} [rc] Optional RoughCanvas instance for Sketch mode
 * @param {boolean} [drawLabel] Pass false when labels are drawn in a dedicated top pass
 * @param {Array<{ x: number, y: number }>} [overridePoints] Precomputed polyline including sharp line jumps
 */
export function drawConnectorElement(
  ctx,
  el,
  elementsById,
  rc,
  drawLabel = true,
  overridePoints,
) {
  const routed = computeConnectorPath(el, elementsById);
  const drawPts = overridePoints && overridePoints.length >= 2 ? overridePoints : routed.points;
  const hasJumps = Boolean(overridePoints && overridePoints.length >= 2);
  if (drawPts.length < 2) return;

  const strokeColor = el.strokeColor;

  ctx.save();
  ctx.globalAlpha = el.opacity;

  if (el.roughness > 0 && rc) {
    /** @type {Record<string, unknown>} */
    const opts = {
      stroke: strokeColor,
      strokeWidth: el.strokeWidth,
      roughness: hasJumps ? Math.min(el.roughness, 0.75) : el.roughness,
      seed: el.seed,
    };
    if (el.strokeStyle === 'dashed') opts.strokeLineDash = [8, 6];
    else if (el.strokeStyle === 'dotted') opts.strokeLineDash = [2, 5];

    /** @type {[number, number][]} */
    const tuples = drawPts.map((p) => [p.x, p.y]);
    if (routed.cubic && !hasJumps) {
      rc.curve(tuples, opts);
    } else {
      rc.linearPath(tuples, opts);
    }
  } else {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = hasJumps ? 'miter' : 'round';
    ctx.miterLimit = 6;
    applyStrokeDash(ctx, el.strokeStyle);

    ctx.beginPath();
    if (routed.cubic && !hasJumps) {
      const { start, cp1, cp2, end } = routed.cubic;
      ctx.moveTo(start.x, start.y);
      ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
    } else {
      ctx.moveTo(drawPts[0].x, drawPts[0].y);
      for (let i = 1; i < drawPts.length; i += 1) {
        ctx.lineTo(drawPts[i].x, drawPts[i].y);
      }
    }
    ctx.stroke();
  }

  const first = routed.points[0];
  const last = routed.points[routed.points.length - 1];
  drawCanvasMarker(ctx, first, routed.startAngle, el.startMarker, strokeColor, el.strokeWidth);
  drawCanvasMarker(ctx, last, routed.endAngle, el.endMarker, strokeColor, el.strokeWidth);
  ctx.restore();

  if (drawLabel) {
    drawConnectorLabel(ctx, el, elementsById);
  }
}

/**
 * Full whiteboard canvas render function.
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   elements: import('../types/schema.js').BoardElement[],
 *   camera: import('./camera.js').Camera,
 *   settings: import('../types/schema.js').BoardSettings,
 *   selectedIds: string[],
 *   hoveredPort: { elementId: string, side: import('../types/schema.js').PortSide, point: { x: number, y: number } } | null,
 *   showPortsForId: string | null,
 *   guides: Array<{ axis: 'x' | 'y', pos: number, from: number, to: number }>,
 *   marquee: { x: number, y: number, width: number, height: number } | null
 * }} state
 */
export function renderCanvasScene(canvas, state) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = UI_TOKENS.bgCanvas;
  ctx.fillRect(0, 0, cssW, cssH);
  drawGrid(ctx, cssW, cssH, state.camera, state.settings.gridMode);

  // Enter world space
  ctx.translate(state.camera.x, state.camera.y);
  ctx.scale(state.camera.zoom, state.camera.zoom);

  const rc = rough.canvas(canvas);
  const elementsById = new Map(state.elements.map((el) => [el.id, el]));
  const jumpPointsMap = computeConnectorJumpPointsMap(state.elements, elementsById);

  // Draw non-connectors first, then connectors on top
  for (const el of state.elements) {
    if (el.type === 'connector') continue;
    if (el.type === 'freehand') {
      drawFreehandElement(ctx, el);
    } else {
      drawShapeElement(ctx, rc, el);
    }
  }

  // Pass 2: Connector lines & arrowheads (with sharp line jumps at crossings)
  for (const el of state.elements) {
    if (el.type === 'connector') {
      drawConnectorElement(
        ctx,
        el,
        elementsById,
        rc,
        false,
        jumpPointsMap.get(el.id),
      );
    }
  }

  // Pass 3: Connector labels strictly on top so wires never slice through text
  for (const el of state.elements) {
    if (el.type === 'connector') {
      drawConnectorLabel(ctx, el, elementsById);
    }
  }

  const uiAccent = UI_TOKENS.brandPrimary;

  // Alignment guides
  if (state.guides.length > 0) {
    ctx.save();
    ctx.strokeStyle = uiAccent;
    ctx.lineWidth = 1 / state.camera.zoom;
    ctx.setLineDash([4 / state.camera.zoom, 4 / state.camera.zoom]);
    for (const g of state.guides) {
      ctx.beginPath();
      if (g.axis === 'x') {
        ctx.moveTo(g.pos, g.from);
        ctx.lineTo(g.pos, g.to);
      } else {
        ctx.moveTo(g.from, g.pos);
        ctx.lineTo(g.to, g.pos);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Selection outlines & resize handles
  const selectedSet = new Set(state.selectedIds);
  for (const el of state.elements) {
    if (!selectedSet.has(el.id)) continue;
    ctx.save();
    ctx.strokeStyle = uiAccent;
    ctx.lineWidth = 1.5 / state.camera.zoom;

    if (el.type === 'connector') {
      const routed = computeConnectorPath(el, elementsById);
      const start = routed.points[0];
      const end = routed.points[routed.points.length - 1];
      const r = 5.5 / state.camera.zoom;

      if (state.selectedIds.length === 1 && !el.locked) {
        // Segment midpoint handles (drag to insert a new bend corner)
        const mr = 3.75 / state.camera.zoom;
        for (const mh of routed.midpointHandles) {
          ctx.beginPath();
          ctx.arc(mh.x, mh.y, mr, 0, Math.PI * 2);
          ctx.fillStyle = '#DBEAFE';
          ctx.fill();
          ctx.strokeStyle = UI_TOKENS.brandPrimary;
          ctx.lineWidth = 1.25 / state.camera.zoom;
          ctx.stroke();
        }

        // Draggable bend/corner handles (diamond shaped for clear distinction from endpoints)
        const cr = 5 / state.camera.zoom;
        for (const ch of routed.cornerHandles) {
          ctx.beginPath();
          ctx.moveTo(ch.x, ch.y - cr);
          ctx.lineTo(ch.x + cr, ch.y);
          ctx.lineTo(ch.x, ch.y + cr);
          ctx.lineTo(ch.x - cr, ch.y);
          ctx.closePath();
          ctx.fillStyle = ch.isCustom ? UI_TOKENS.brandPrimary : '#FFFFFF';
          ctx.fill();
          ctx.strokeStyle = ch.isCustom ? '#FFFFFF' : UI_TOKENS.brandPrimary;
          ctx.lineWidth = 1.5 / state.camera.zoom;
          ctx.stroke();
        }
      }

      // Start & End endpoint handles
      ctx.strokeStyle = UI_TOKENS.brandPrimary;
      ctx.lineWidth = 1.5 / state.camera.zoom;
      [start, end].forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.stroke();
      });
    } else if (el.type === 'freehand') {
      const b = getElementBounds(el, elementsById);
      const pad = 4 / state.camera.zoom;
      ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
    } else {
      const r = getNormalizedRect(el);
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const rot = el.rotation || 0;
      const pad = 4 / state.camera.zoom;

      ctx.save();
      if (rot) {
        ctx.translate(cx, cy);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      ctx.strokeRect(r.x - pad, r.y - pad, r.width + pad * 2, r.height + pad * 2);

      if (state.selectedIds.length === 1 && !el.locked) {
        const hs = 8 / state.camera.zoom;
        for (const h of getResizeHandles(r, 0)) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
          ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
        }

        // Top rotation stem & circular handle with curved counter-clockwise arrow icon
        const knobLocal = getRotationHandle(r, state.camera.zoom, 0);
        const kr = 9 / state.camera.zoom;
        const kx = knobLocal.x;
        const ky = knobLocal.y;

        ctx.beginPath();
        ctx.moveTo(knobLocal.stemStart.x, knobLocal.stemStart.y);
        ctx.lineTo(kx, ky + kr);
        ctx.strokeStyle = UI_TOKENS.brandPrimary;
        ctx.lineWidth = 1.5 / state.camera.zoom;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(kx, ky, kr, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = UI_TOKENS.brandPrimary;
        ctx.lineWidth = 1.5 / state.camera.zoom;
        ctx.stroke();

        // Crisp circular arrow icon (open ~285° arc + top-left arrowhead, matching RotateCcw)
        const iconR = 4.6 / state.camera.zoom;
        const startAng = -Math.PI * 0.72; // top-left arrowhead tip
        const endAng = Math.PI * 0.92; // wraps clockwise around top -> right -> bottom -> left
        ctx.beginPath();
        ctx.arc(kx, ky, iconR, startAng, endAng, false);
        ctx.strokeStyle = UI_TOKENS.brandPrimary;
        ctx.lineWidth = 1.5 / state.camera.zoom;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Arrowhead at top-left pointing counter-clockwise
        const tipX = kx + iconR * Math.cos(startAng);
        const tipY = ky + iconR * Math.sin(startAng);
        const headLen = 2.8 / state.camera.zoom;
        ctx.beginPath();
        ctx.moveTo(tipX - headLen * 0.15, tipY - headLen * 0.95);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(tipX + headLen * 1.0, tipY + headLen * 0.12);
        ctx.strokeStyle = UI_TOKENS.brandPrimary;
        ctx.lineWidth = 1.5 / state.camera.zoom;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      ctx.restore();

      // Upright live angle pill when single rotated element is selected
      if (state.selectedIds.length === 1 && !el.locked && rot) {
        const knobWorld = getRotationHandle(r, state.camera.zoom, rot);
        const label = `${Math.round(rot)}°`;
        const fontSize = 11 / state.camera.zoom;
        ctx.save();
        ctx.font = `600 ${fontSize}px ${FONT_FAMILY_MAP.mono}`;
        const tw = ctx.measureText(label).width;
        const px = 6 / state.camera.zoom;
        const py = 3 / state.camera.zoom;
        const bw = tw + px * 2;
        const bh = fontSize + py * 2;
        const bx = knobWorld.x + 12 / state.camera.zoom;
        const by = knobWorld.y - bh / 2;
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.roundRect?.(bx, by, bw, bh, 4 / state.camera.zoom);
        if (!ctx.roundRect) ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + bw / 2, by + bh / 2);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // Flexible anchor guide & live sliding snap point when hovering/connecting
  if (state.showPortsForId) {
    const target = elementsById.get(state.showPortsForId);
    if (target && isConnectableElement(target)) {
      const b = getNormalizedRect(target);
      const ports = getShapePorts(target);
      const r = 4 / state.camera.zoom;
      ctx.save();

      // Subtle dashed perimeter highlight indicating any point along the edge is connectable
      ctx.save();
      if (target.rotation) {
        const tcx = b.x + b.width / 2;
        const tcy = b.y + b.height / 2;
        ctx.translate(tcx, tcy);
        ctx.rotate((target.rotation * Math.PI) / 180);
        ctx.translate(-tcx, -tcy);
      }
      ctx.strokeStyle = UI_TOKENS.brandPrimary;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5 / state.camera.zoom;
      ctx.setLineDash([4 / state.camera.zoom, 4 / state.camera.zoom]);
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      ctx.setLineDash([]);
      ctx.restore();

      // Subtle cardinal midpoint reference dots
      ctx.globalAlpha = 0.65;
      for (const pt of Object.values(ports)) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = UI_TOKENS.brandPrimary;
        ctx.lineWidth = 1.25 / state.camera.zoom;
        ctx.stroke();
      }

      // Live active anchor point sliding freely along the perimeter (or interior with Alt)
      if (state.hoveredPort && state.hoveredPort.elementId === target.id) {
        const hp = state.hoveredPort.point;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 7 / state.camera.zoom, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 5 / state.camera.zoom, 0, Math.PI * 2);
        ctx.fillStyle = UI_TOKENS.brandPrimary;
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // Marquee box
  if (state.marquee) {
    ctx.save();
    ctx.fillStyle = 'rgba(29, 78, 216, 0.08)';
    ctx.strokeStyle = UI_TOKENS.brandPrimary;
    ctx.lineWidth = 1 / state.camera.zoom;
    ctx.fillRect(state.marquee.x, state.marquee.y, state.marquee.width, state.marquee.height);
    ctx.strokeRect(state.marquee.x, state.marquee.y, state.marquee.width, state.marquee.height);
    ctx.restore();
  }

  ctx.restore();
}
