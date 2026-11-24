import rough from 'roughjs';
import getStroke from 'perfect-freehand';
import { FONT_FAMILY_MAP, GRID_SIZE, UI_TOKENS } from '../constants/tokens.js';
import { getElementBounds, getResizeHandles } from './geometry.js';
import { drawCanvasMarker } from './markers.js';
import { getShapePorts, isConnectableElement } from './ports.js';
import { computeConnectorPath } from './router.js';
import { applyStrokeDash, drawShapeElement } from './shapeRegistry.js';

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
 * Render a connector (straight, orthogonal elbow, or curved) with markers and optional midpoint label.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../types/schema.js').BoardElement} el
 * @param {Map<string, import('../types/schema.js').BoardElement>} elementsById
 * @param {any} [rc] Optional RoughCanvas instance for Sketch mode
 */
export function drawConnectorElement(ctx, el, elementsById, rc) {
  const routed = computeConnectorPath(el, elementsById);
  if (routed.points.length < 2) return;

  ctx.save();
  ctx.globalAlpha = el.opacity;

  if (el.roughness > 0 && rc) {
    /** @type {Record<string, unknown>} */
    const opts = {
      stroke: el.strokeColor,
      strokeWidth: el.strokeWidth,
      roughness: el.roughness,
      seed: el.seed,
    };
    if (el.strokeStyle === 'dashed') opts.strokeLineDash = [8, 6];
    else if (el.strokeStyle === 'dotted') opts.strokeLineDash = [2, 5];

    /** @type {[number, number][]} */
    const tuples = routed.points.map((p) => [p.x, p.y]);
    if (routed.cubic) {
      rc.curve(tuples, opts);
    } else {
      rc.linearPath(tuples, opts);
    }
  } else {
    ctx.strokeStyle = el.strokeColor;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    applyStrokeDash(ctx, el.strokeStyle);

    ctx.beginPath();
    if (routed.cubic) {
      const { start, cp1, cp2, end } = routed.cubic;
      ctx.moveTo(start.x, start.y);
      ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
    } else {
      ctx.moveTo(routed.points[0].x, routed.points[0].y);
      for (let i = 1; i < routed.points.length; i += 1) {
        ctx.lineTo(routed.points[i].x, routed.points[i].y);
      }
    }
    ctx.stroke();
  }

  const first = routed.points[0];
  const last = routed.points[routed.points.length - 1];
  drawCanvasMarker(ctx, first, routed.startAngle, el.startMarker, el.strokeColor, el.strokeWidth);
  drawCanvasMarker(ctx, last, routed.endAngle, el.endMarker, el.strokeColor, el.strokeWidth);

  if (el.text && el.text.trim()) {
    const fontSize = el.fontSize || 12;
    const family = FONT_FAMILY_MAP[el.fontFamily || 'sans'];
    ctx.setLineDash([]);
    ctx.font = `500 ${fontSize}px ${family}`;
    const textW = ctx.measureText(el.text).width;
    const padX = 6;
    const padY = 3;
    const bx = routed.labelPosition.x - textW / 2 - padX;
    const by = routed.labelPosition.y - fontSize / 2 - padY;

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.fillRect(bx, by, textW + padX * 2, fontSize + padY * 2);
    ctx.strokeRect(bx, by, textW + padX * 2, fontSize + padY * 2);

    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(el.text, routed.labelPosition.x, routed.labelPosition.y);
  }

  ctx.restore();
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

  // Draw non-connectors first, then connectors on top
  for (const el of state.elements) {
    if (el.type === 'connector') continue;
    if (el.type === 'freehand') {
      drawFreehandElement(ctx, el);
    } else {
      drawShapeElement(ctx, rc, el);
    }
  }

  for (const el of state.elements) {
    if (el.type === 'connector') {
      drawConnectorElement(ctx, el, elementsById, rc);
    }
  }

  // Alignment guides
  if (state.guides.length > 0) {
    ctx.save();
    ctx.strokeStyle = UI_TOKENS.brandPrimary;
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
    ctx.strokeStyle = UI_TOKENS.brandPrimary;
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
    } else {
      const b = getElementBounds(el, elementsById);
      const pad = 4 / state.camera.zoom;
      ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);

      if (state.selectedIds.length === 1 && el.type !== 'freehand' && !el.locked) {
        const hs = 8 / state.camera.zoom;
        for (const h of getResizeHandles(b)) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
          ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
        }
      }
    }
    ctx.restore();
  }

  // Flexible anchor guide & live sliding snap point when hovering/connecting
  if (state.showPortsForId) {
    const target = elementsById.get(state.showPortsForId);
    if (target && isConnectableElement(target)) {
      const b = getElementBounds(target, elementsById);
      const ports = getShapePorts(target);
      const r = 4 / state.camera.zoom;
      ctx.save();

      // Subtle dashed perimeter highlight indicating any point along the edge is connectable
      ctx.strokeStyle = UI_TOKENS.brandPrimary;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5 / state.camera.zoom;
      ctx.setLineDash([4 / state.camera.zoom, 4 / state.camera.zoom]);
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      ctx.setLineDash([]);

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
