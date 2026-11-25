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

export const DARK_CANVAS_BG = '#0B1120';

const DARK_STROKE_MAP = {
  '#0F172A': '#F1F5F9',
  '#1E293B': '#E2E8F0',
  '#000000': '#F1F5F9',
  '#334155': '#CBD5E1',
  '#475569': '#CBD5E1',
  '#666666': '#CBD5E1',
  '#1D4ED8': '#60A5FA',
  '#1E40AF': '#60A5FA',
  '#1565C0': '#60A5FA',
  '#15803D': '#4ADE80',
  '#2E7D32': '#4ADE80',
  '#B45309': '#FBBF24',
  '#B91C1C': '#F87171',
  '#0E7490': '#22D3EE',
};

const DARK_FILL_MAP = {
  '#FFFFFF': '#1E293B',
  '#F8FAFC': '#172033',
  '#F5F5F5': '#172033',
  '#F1F5F9': '#253349',
  '#E2E8F0': '#334155',
  '#DBEAFE': '#1E3A5F',
  '#DCFCE7': '#143A29',
  '#FEF3C7': '#3F2E14',
  '#FEE2E2': '#441C24',
  '#CFFAFE': '#143A47',
  '#0F172A': '#F1F5F9',
  '#1E293B': '#E2E8F0',
  '#000000': '#F1F5F9',
  '#334155': '#CBD5E1',
  '#475569': '#CBD5E1',
  '#666666': '#CBD5E1',
  '#1D4ED8': '#60A5FA',
  '#15803D': '#4ADE80',
  '#B45309': '#FBBF24',
  '#B91C1C': '#F87171',
  '#0E7490': '#22D3EE',
};

/**
 * Parse `#RGB` or `#RRGGBB` color strings.
 * @param {string} color
 * @returns {{ r: number, g: number, b: number } | null}
 */
function parseHexColor(color) {
  const m = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

/**
 * Adapt light-mode diagram colors for dark canvas rendering without mutating stored data.
 * @param {string} color
 * @param {'fill' | 'stroke'} kind
 * @returns {string}
 */
export function adaptColorForDarkCanvas(color, kind) {
  const trimmed = color.trim();
  if (!trimmed.startsWith('#')) return color;
  const rgb = parseHexColor(trimmed);
  if (!rgb) return color;

  const upper =
    trimmed.length === 4
      ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toUpperCase()
      : trimmed.toUpperCase();

  if (kind === 'stroke' && DARK_STROKE_MAP[/** @type {keyof typeof DARK_STROKE_MAP} */ (upper)]) {
    return DARK_STROKE_MAP[/** @type {keyof typeof DARK_STROKE_MAP} */ (upper)];
  }
  if (kind === 'fill' && DARK_FILL_MAP[/** @type {keyof typeof DARK_FILL_MAP} */ (upper)]) {
    return DARK_FILL_MAP[/** @type {keyof typeof DARK_FILL_MAP} */ (upper)];
  }

  const lum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  const toHex = (/** @type {number} */ v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

  if (kind === 'fill' && lum >= 0.76) {
    // Convert bright paper/pastel fills into subtle dark-mode tinted surfaces
    const mix = (/** @type {number} */ c, /** @type {number} */ base) => base + (c - 180) * 0.25;
    return `#${toHex(mix(rgb.r, 30))}${toHex(mix(rgb.g, 41))}${toHex(mix(rgb.b, 59))}`;
  }

  if (lum <= 0.32) {
    const lift = (/** @type {number} */ c) => c + (241 - c) * 0.72;
    return `#${toHex(lift(rgb.r))}${toHex(lift(rgb.g))}${toHex(lift(rgb.b))}`;
  }

  return color;
}

/**
 * Temporarily intercept CanvasRenderingContext2D fillStyle/strokeStyle assignments for dark canvas rendering.
 * @param {CanvasRenderingContext2D} ctx
 * @returns {() => void}
 */
export function patchDarkCanvasPalette(ctx) {
  if (typeof CanvasRenderingContext2D === 'undefined') return () => {};
  const proto = CanvasRenderingContext2D.prototype;
  const fillDesc = Object.getOwnPropertyDescriptor(proto, 'fillStyle');
  const strokeDesc = Object.getOwnPropertyDescriptor(proto, 'strokeStyle');
  if (!fillDesc?.get || !fillDesc.set || !strokeDesc?.get || !strokeDesc.set) {
    return () => {};
  }
  const { get: fGet, set: fSet } = fillDesc;
  const { get: sGet, set: sSet } = strokeDesc;

  Object.defineProperty(ctx, 'fillStyle', {
    configurable: true,
    get: () => fGet.call(ctx),
    set: (v) => {
      fSet.call(ctx, typeof v === 'string' ? adaptColorForDarkCanvas(v, 'fill') : v);
    },
  });
  Object.defineProperty(ctx, 'strokeStyle', {
    configurable: true,
    get: () => sGet.call(ctx),
    set: (v) => {
      sSet.call(ctx, typeof v === 'string' ? adaptColorForDarkCanvas(v, 'stroke') : v);
    },
  });

  return () => {
    Reflect.deleteProperty(ctx, 'fillStyle');
    Reflect.deleteProperty(ctx, 'strokeStyle');
  };
}

/**
 * Render background grid (dots or lines) in screen space aligned with camera.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {import('./camera.js').Camera} camera
 * @param {import('../types/schema.js').GridMode} gridMode
 * @param {boolean} [isDark]
 */
function drawGrid(ctx, width, height, camera, gridMode, isDark = false) {
  if (gridMode === 'none') return;

  const step = GRID_SIZE * camera.zoom;
  if (step < 8) return;

  const startX = ((camera.x % step) + step) % step;
  const startY = ((camera.y % step) + step) % step;

  ctx.save();
  if (gridMode === 'dots') {
    ctx.fillStyle = isDark ? '#334155' : '#CBD5E1';
    for (let x = startX; x < width; x += step) {
      for (let y = startY; y < height; y += step) {
        ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
    }
  } else {
    ctx.strokeStyle = isDark ? '#1E293B' : '#E2E8F0';
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
 * @param {boolean} [isDark]
 */
export function drawConnectorLabel(ctx, el, elementsById, isDark = false) {
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

  // Report-clean knockout mask (matches canvas background, crisp text without cluttered box borders)
  ctx.fillStyle = isDark ? 'rgba(11, 17, 32, 0.92)' : 'rgba(255, 255, 255, 0.94)';
  ctx.beginPath();
  ctx.roundRect?.(bx, by, boxW, boxH, 3);
  if (!ctx.roundRect) ctx.rect(bx, by, boxW, boxH);
  ctx.fill();

  ctx.fillStyle = isDark ? '#F1F5F9' : '#0F172A';
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
 *   theme?: 'light' | 'dark',
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

  const isDark = state.theme === 'dark';
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;

  // Supersample the backing buffer at low zoom (< 85%) so small glyphs remain sharp on 1x/1.25x screens
  const targetScale =
    state.camera.zoom < 0.85 ? Math.max(dpr, 2.25) : Math.max(dpr, dpr < 1.5 ? 1.5 : dpr);
  const maxDim = Math.max(cssW, cssH, 1);
  const maxSafeScale = Math.max(dpr, 4096 / maxDim);
  const renderScale = Math.min(targetScale, maxSafeScale, 2.5);

  const targetW = Math.round(cssW * renderScale);
  const targetH = Math.round(cssH * renderScale);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  ctx.save();
  ctx.scale(renderScale, renderScale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const extCtx = /** @type {CanvasRenderingContext2D & { textRendering?: string }} */ (ctx);
  if ('textRendering' in extCtx) {
    extCtx.textRendering = 'geometricPrecision';
  }

  ctx.fillStyle = isDark ? DARK_CANVAS_BG : UI_TOKENS.bgCanvas;
  ctx.fillRect(0, 0, cssW, cssH);
  drawGrid(ctx, cssW, cssH, state.camera, state.settings.gridMode, isDark);

  // Snap translation to backing pixels to prevent subpixel text/line blur at low zoom
  const camX = Math.round(state.camera.x * renderScale) / renderScale;
  const camY = Math.round(state.camera.y * renderScale) / renderScale;

  // Enter world space
  ctx.translate(camX, camY);
  ctx.scale(state.camera.zoom, state.camera.zoom);

  const rc = rough.canvas(canvas);
  const elementsById = new Map(state.elements.map((el) => [el.id, el]));
  const jumpPointsMap = computeConnectorJumpPointsMap(state.elements, elementsById);

  const restorePalette = isDark ? patchDarkCanvasPalette(ctx) : () => {};
  try {
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
  } finally {
    restorePalette();
  }

  // Pass 3: Connector labels strictly on top so wires never slice through text
  for (const el of state.elements) {
    if (el.type === 'connector') {
      drawConnectorLabel(ctx, el, elementsById, isDark);
    }
  }

  const uiAccent = isDark ? '#60A5FA' : UI_TOKENS.brandPrimary;
  const handleFill = isDark ? '#0F172A' : '#FFFFFF';

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
          ctx.fillStyle = ch.isCustom ? uiAccent : handleFill;
          ctx.fill();
          ctx.strokeStyle = ch.isCustom ? handleFill : uiAccent;
          ctx.lineWidth = 1.5 / state.camera.zoom;
          ctx.stroke();
        }
      }

      // Start & End endpoint handles
      ctx.strokeStyle = uiAccent;
      ctx.lineWidth = 1.5 / state.camera.zoom;
      [start, end].forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fillStyle = handleFill;
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
          ctx.fillStyle = handleFill;
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
        ctx.strokeStyle = uiAccent;
        ctx.lineWidth = 1.5 / state.camera.zoom;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(kx, ky, kr, 0, Math.PI * 2);
        ctx.fillStyle = handleFill;
        ctx.fill();
        ctx.strokeStyle = uiAccent;
        ctx.lineWidth = 1.5 / state.camera.zoom;
        ctx.stroke();

        // Crisp circular arrow icon (open ~285° arc + top-left arrowhead, matching RotateCcw)
        const iconR = 4.6 / state.camera.zoom;
        const startAng = -Math.PI * 0.72; // top-left arrowhead tip
        const endAng = Math.PI * 0.92; // wraps clockwise around top -> right -> bottom -> left
        ctx.beginPath();
        ctx.arc(kx, ky, iconR, startAng, endAng, false);
        ctx.strokeStyle = uiAccent;
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
        ctx.strokeStyle = uiAccent;
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
        ctx.fillStyle = isDark ? '#E2E8F0' : '#0F172A';
        ctx.beginPath();
        ctx.roundRect?.(bx, by, bw, bh, 4 / state.camera.zoom);
        if (!ctx.roundRect) ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.fillStyle = isDark ? '#0F172A' : '#FFFFFF';
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
      ctx.strokeStyle = uiAccent;
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
        ctx.fillStyle = handleFill;
        ctx.fill();
        ctx.strokeStyle = uiAccent;
        ctx.lineWidth = 1.25 / state.camera.zoom;
        ctx.stroke();
      }

      // Live active anchor point sliding freely along the perimeter (or interior with Alt)
      if (state.hoveredPort && state.hoveredPort.elementId === target.id) {
        const hp = state.hoveredPort.point;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 7 / state.camera.zoom, 0, Math.PI * 2);
        ctx.fillStyle = handleFill;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 5 / state.camera.zoom, 0, Math.PI * 2);
        ctx.fillStyle = uiAccent;
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // Marquee box
  if (state.marquee) {
    ctx.save();
    ctx.fillStyle = isDark ? 'rgba(96, 165, 250, 0.14)' : 'rgba(29, 78, 216, 0.08)';
    ctx.strokeStyle = uiAccent;
    ctx.lineWidth = 1 / state.camera.zoom;
    ctx.fillRect(state.marquee.x, state.marquee.y, state.marquee.width, state.marquee.height);
    ctx.strokeRect(state.marquee.x, state.marquee.y, state.marquee.width, state.marquee.height);
    ctx.restore();
  }

  ctx.restore();
}
