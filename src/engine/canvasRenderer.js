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

/** @type {HTMLCanvasElement | null} */
let cachedChalkGritTile = null;
/** @type {{ canvas: HTMLCanvasElement, w: number, h: number } | null} */
let cachedChalkBackdrop = null;
/** @type {HTMLCanvasElement | null} */
let cachedChalkGrainTile = null;
/** @type {HTMLCanvasElement | null} */
let chalkLayerCanvas = null;

/** Hand-tuned crisp chalk stick tones for the classic medium-green school chalkboard (#2D603D). */
const CHALK_INK_TABLE = {
  '#0F172A': '#F9FBF9',
  '#1E293B': '#F9FBF9',
  '#000000': '#F9FBF9',
  '#334155': '#EDF4EE',
  '#475569': '#DCE7DF',
  '#1D4ED8': '#B8D6FF',
  '#1E40AF': '#B8D6FF',
  '#15803D': '#C5F7D2',
  '#B45309': '#FFF0A8',
  '#B91C1C': '#FFC2C2',
  '#0E7490': '#B0F2FA',
};

/**
 * Parse `#RGB` / `#RRGGBB` into RGB channels.
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
 * Convert any stored technical color into a chalk-on-slate tone (render-only, never mutates data).
 * Dark ink becomes white/pastel chalk; light paper fills become faint translucent chalk shading.
 * @param {string} color
 * @param {'fill' | 'stroke'} kind
 * @returns {string}
 */
export function toChalkInk(color, kind) {
  const rgb = parseHexColor(color);
  if (!rgb) return color;
  const key = /** @type {keyof typeof CHALK_INK_TABLE} */ (`#${color.trim().slice(1).toUpperCase()}`);
  if (CHALK_INK_TABLE[key]) return CHALK_INK_TABLE[key];

  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const sat = (max - min) / 255;
  const lum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;

  // Light paper / pastel fills -> faint chalk shading so the slate shows through
  if (lum >= 0.7) {
    const alpha = kind === 'stroke' ? 0.4 : sat < 0.1 ? 0.05 : 0.13;
    if (sat < 0.1) return `rgba(243, 245, 240, ${alpha})`;
    const mix = (c) => Math.round(c + (255 - c) * 0.2);
    return `rgba(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)}, ${alpha})`;
  }

  // Ink colors -> lifted pastel chalk sticks
  if (sat < 0.12) return '#EEF2EE';
  const lift = (c) => Math.round(c + (255 - c) * 0.6);
  const toHex = (c) => c.toString(16).padStart(2, '0');
  return `#${toHex(lift(rgb.r))}${toHex(lift(rgb.g))}${toHex(lift(rgb.b))}`;
}

/**
 * Temporarily route every fill/stroke color and font assigned on a context through the chalk palette,
 * so all symbols (including hardcoded table headers, markers, and Rough.js sketches) render as chalk.
 * @param {CanvasRenderingContext2D} ctx
 * @returns {() => void} Restore function
 */
function patchChalkInk(ctx) {
  if (typeof CanvasRenderingContext2D === 'undefined') return () => {};
  const proto = CanvasRenderingContext2D.prototype;
  const fillDesc = Object.getOwnPropertyDescriptor(proto, 'fillStyle');
  const strokeDesc = Object.getOwnPropertyDescriptor(proto, 'strokeStyle');
  const fontDesc = Object.getOwnPropertyDescriptor(proto, 'font');
  if (!fillDesc?.get || !fillDesc.set || !strokeDesc?.get || !strokeDesc.set || !fontDesc?.get || !fontDesc.set) {
    return () => {};
  }
  const { get: fGet, set: fSet } = fillDesc;
  const { get: sGet, set: sSet } = strokeDesc;
  const { get: tGet, set: tSet } = fontDesc;

  Object.defineProperty(ctx, 'fillStyle', {
    configurable: true,
    get: () => fGet.call(ctx),
    set: (v) => {
      fSet.call(ctx, typeof v === 'string' ? toChalkInk(v, 'fill') : v);
    },
  });
  Object.defineProperty(ctx, 'strokeStyle', {
    configurable: true,
    get: () => sGet.call(ctx),
    set: (v) => {
      sSet.call(ctx, typeof v === 'string' ? toChalkInk(v, 'stroke') : v);
    },
  });
  Object.defineProperty(ctx, 'font', {
    configurable: true,
    get: () => tGet.call(ctx),
    set: (v) => {
      tSet.call(
        ctx,
        typeof v === 'string'
          ? v.replace(FONT_FAMILY_MAP.sans, FONT_FAMILY_MAP.sketch).replace(FONT_FAMILY_MAP.mono, FONT_FAMILY_MAP.sketch)
          : v,
      );
    },
  });

  return () => {
    Reflect.deleteProperty(ctx, 'fillStyle');
    Reflect.deleteProperty(ctx, 'strokeStyle');
    Reflect.deleteProperty(ctx, 'font');
  };
}

/**
 * Build (once) a chalk "skip" grain mask: tiny gaps where chalk fails to deposit on the slate's tooth.
 * Applied with destination-out so every stroke, letter, and fill gets the dry, broken chalk texture.
 * @returns {HTMLCanvasElement | null}
 */
function getChalkGrainTile() {
  if (typeof document === 'undefined') return null;
  if (cachedChalkGrainTile) return cachedChalkGrainTile;

  const size = 256;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;

  let seed = 90127;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Slight overall translucency (chalk is never fully opaque)
  tctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  tctx.fillRect(0, 0, size, size);

  // Dense micro-gaps from the slate surface tooth
  for (let i = 0; i < 7200; i += 1) {
    const s = rand() > 0.8 ? 1.7 : 1.1;
    tctx.fillStyle = `rgba(0, 0, 0, ${(0.35 + rand() * 0.6).toFixed(2)})`;
    tctx.fillRect(rand() * size, rand() * size, s, s);
  }

  // Short dry-drag skips along the writing direction
  tctx.lineCap = 'round';
  for (let i = 0; i < 170; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 3 + rand() * 9;
    const ang = (rand() - 0.5) * 0.7;
    tctx.strokeStyle = `rgba(0, 0, 0, ${(0.45 + rand() * 0.45).toFixed(2)})`;
    tctx.lineWidth = 0.7 + rand() * 0.6;
    tctx.beginPath();
    tctx.moveTo(x, y);
    tctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    tctx.stroke();
  }

  cachedChalkGrainTile = tile;
  return tile;
}

/**
 * Render all board elements as chalk writing on the slate: chalk palette + chalk handwriting font,
 * grainy broken texture, and a faint dust smear, composited onto the destination context.
 * @param {CanvasRenderingContext2D} destCtx
 * @param {import('../types/schema.js').BoardElement[]} elements
 * @param {{
 *   widthPx: number,
 *   heightPx: number,
 *   transform: [number, number, number, number, number, number],
 *   grainOriginX: number,
 *   grainOriginY: number,
 *   pixelRatio: number
 * }} opts
 * @returns {boolean} true when the chalk layer was rendered
 */
export function drawChalkElementsLayer(destCtx, elements, opts) {
  if (typeof document === 'undefined' || opts.widthPx < 1 || opts.heightPx < 1) return false;
  if (!chalkLayerCanvas) chalkLayerCanvas = document.createElement('canvas');
  const layer = chalkLayerCanvas;
  if (layer.width !== opts.widthPx) layer.width = opts.widthPx;
  if (layer.height !== opts.heightPx) layer.height = opts.heightPx;
  const lctx = layer.getContext('2d');
  if (!lctx) return false;

  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.globalAlpha = 1;
  lctx.clearRect(0, 0, layer.width, layer.height);
  lctx.setTransform(...opts.transform);

  const rc = rough.canvas(layer);
  const elementsById = new Map(elements.map((el) => [el.id, el]));
  const jumpPointsMap = computeConnectorJumpPointsMap(elements, elementsById);

  const restoreInk = patchChalkInk(lctx);
  try {
    for (const el of elements) {
      if (el.type === 'connector') continue;
      if (el.type === 'freehand') {
        drawFreehandElement(lctx, el);
      } else {
        const chalkEl =
          el.roughness > 0 ? el : { ...el, roughness: 1.25 };
        drawShapeElement(lctx, rc, chalkEl);
      }
    }
    for (const el of elements) {
      if (el.type === 'connector') {
        const chalkConn =
          el.roughness > 0 ? el : { ...el, roughness: 1.15 };
        drawConnectorElement(
          lctx,
          chalkConn,
          elementsById,
          rc,
          false,
          false,
          jumpPointsMap.get(el.id),
        );
      }
    }
  } finally {
    restoreInk();
  }
  for (const el of elements) {
    if (el.type === 'connector') drawConnectorLabel(lctx, el, elementsById, true);
  }

  // Erode with chalk grain so lines & letters look dry, broken, and dusty
  const grain = getChalkGrainTile();
  if (grain) {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    const pattern = lctx.createPattern(grain, 'repeat');
    if (pattern) {
      if (typeof pattern.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
        pattern.setTransform(
          new DOMMatrix([opts.pixelRatio, 0, 0, opts.pixelRatio, opts.grainOriginX, opts.grainOriginY]),
        );
      }
      lctx.globalCompositeOperation = 'destination-out';
      lctx.fillStyle = pattern;
      lctx.fillRect(0, 0, layer.width, layer.height);
      lctx.globalCompositeOperation = 'source-over';
    }
  }

  destCtx.save();
  destCtx.setTransform(1, 0, 0, 1, 0, 0);
  // Faint offset dust smear left behind by the chalk stick
  destCtx.globalAlpha = 0.2;
  destCtx.drawImage(layer, opts.pixelRatio * 0.9, opts.pixelRatio * 0.7);
  destCtx.globalAlpha = 0.94;
  destCtx.drawImage(layer, 0, 0);
  destCtx.restore();
  return true;
}

/**
 * Build (once) a 100% seamless 256x256 fine mineral slate grit tile (1px-1.5px speckles only,
 * zero large shapes crossing edges so repeating produces ZERO visible tile seams).
 * @returns {HTMLCanvasElement | null}
 */
function getChalkGritTile() {
  if (typeof document === 'undefined') return null;
  if (cachedChalkGritTile) return cachedChalkGritTile;

  const size = 256;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;

  let seed = 4219;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 4200; i += 1) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const bright = rand() > 0.48;
    const speck = rand() > 0.85 ? 1.5 : 1;
    tctx.fillStyle = bright
      ? `rgba(232, 246, 235, ${(0.018 + rand() * 0.042).toFixed(3)})`
      : `rgba(14, 38, 22, ${(0.028 + rand() * 0.052).toFixed(3)})`;
    tctx.fillRect(x, y, speck, speck);
  }

  cachedChalkGritTile = tile;
  return tile;
}

/**
 * Draw a single ultra-soft radial chalk-dust cloud (fades smoothly to 0 alpha at rim, zero hard edges).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} rx
 * @param {number} ry
 * @param {number} rot
 * @param {string} rgb
 * @param {number} alpha
 */
function drawSoftChalkCloud(ctx, cx, cy, rx, ry, rot, rgb, alpha) {
  if (typeof ctx.createRadialGradient !== 'function') return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(1, ry / Math.max(1, rx));
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  grad.addColorStop(0, `rgba(${rgb}, ${alpha.toFixed(3)})`);
  grad.addColorStop(0.55, `rgba(${rgb}, ${(alpha * 0.45).toFixed(3)})`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Render the full-viewport seamless green classroom chalkboard surface onto a cached offscreen canvas.
 * Because clouds and sweeping wipe streaks are drawn in full-viewport coordinates (never tiled),
 * there are ZERO square grid/tile seams at any screen size.
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement | null}
 */
function getChalkBackdropCanvas(width, height) {
  if (typeof document === 'undefined' || width < 1 || height < 1) return null;
  const w = Math.ceil(width);
  const h = Math.ceil(height);
  if (cachedChalkBackdrop && cachedChalkBackdrop.w === w && cachedChalkBackdrop.h === h) {
    return cachedChalkBackdrop.canvas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const bctx = canvas.getContext('2d');
  if (!bctx) return null;

  // 1. Classic medium school chalkboard green base (#2D603D)
  bctx.fillStyle = '#2D603D';
  bctx.fillRect(0, 0, w, h);

  // 2. Natural soft milky-green chalk center glow & deeper mossy green toward edges
  if (typeof bctx.createRadialGradient === 'function') {
    const grad = bctx.createRadialGradient(
      w * 0.48,
      h * 0.42,
      Math.min(w, h) * 0.05,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.78,
    );
    grad.addColorStop(0, 'rgba(116, 174, 132, 0.32)');
    grad.addColorStop(0.42, 'rgba(78, 134, 94, 0.16)');
    grad.addColorStop(0.75, 'rgba(34, 78, 48, 0.12)');
    grad.addColorStop(1, 'rgba(20, 52, 31, 0.46)');
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, w, h);
  }

  // 3. Organic full-board wiped-chalk haze clouds (soft feathered gradients, never hard ovals)
  let seed = 7331;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 28; i += 1) {
    const cx = w * (0.08 + rand() * 0.84);
    const cy = h * (0.08 + rand() * 0.84);
    const rx = Math.max(w, h) * (0.12 + rand() * 0.18);
    const ry = Math.min(w, h) * (0.06 + rand() * 0.11);
    const rot = -0.35 + rand() * 0.55;
    const isLight = rand() > 0.25;
    drawSoftChalkCloud(
      bctx,
      cx,
      cy,
      rx,
      ry,
      rot,
      isLight ? '220, 240, 224' : '22, 54, 33',
      isLight ? 0.028 + rand() * 0.036 : 0.04 + rand() * 0.045,
    );
  }

  // 4. Sweeping damp-cloth eraser passes across the middle (feathered multi-pass glow, zero hard edges)
  const sweepPaths = [
    { x0: 0.12, y0: 0.46, cx: 0.46, cy: 0.26, x1: 0.82, y1: 0.36 },
    { x0: 0.14, y0: 0.64, cx: 0.48, cy: 0.42, x1: 0.86, y1: 0.54 },
    { x0: 0.22, y0: 0.76, cx: 0.54, cy: 0.58, x1: 0.84, y1: 0.66 },
  ];
  bctx.save();
  bctx.lineCap = 'round';
  for (const sp of sweepPaths) {
    // 4 concentric soft translucent strokes create a smooth Gaussian feather without canvas filter lag
    const passes = [
      { mult: 1.5, alpha: 0.012 },
      { mult: 1.0, alpha: 0.018 },
      { mult: 0.6, alpha: 0.022 },
      { mult: 0.32, alpha: 0.016 },
    ];
    for (const p of passes) {
      bctx.strokeStyle = `rgba(228, 244, 232, ${p.alpha})`;
      bctx.lineWidth = Math.max(28, Math.min(w, h) * 0.11 * p.mult);
      bctx.beginPath();
      bctx.moveTo(w * sp.x0, h * sp.y0);
      bctx.quadraticCurveTo(w * sp.cx, h * sp.cy, w * sp.x1, h * sp.y1);
      bctx.stroke();
    }
  }
  bctx.restore();

  // 5. Seamless fine matte slate mineral grit across entire board
  const grit = getChalkGritTile();
  if (grit && typeof bctx.createPattern === 'function') {
    const pattern = bctx.createPattern(grit, 'repeat');
    if (pattern) {
      bctx.fillStyle = pattern;
      bctx.fillRect(0, 0, w, h);
    }
  }

  cachedChalkBackdrop = { canvas, w, h };
  return canvas;
}

/**
 * Draw authentic seamless classic green classroom chalkboard background (#2D603D).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 */
export function drawChalkboardBackground(ctx, width, height) {
  const backdrop = getChalkBackdropCanvas(width, height);
  if (backdrop && typeof ctx.drawImage === 'function') {
    ctx.drawImage(backdrop, 0, 0, width, height);
    return;
  }
  ctx.save();
  ctx.fillStyle = '#2D603D';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Render background grid (dots or lines) in screen space aligned with camera.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {import('./camera.js').Camera} camera
 * @param {import('../types/schema.js').GridMode} gridMode
 * @param {boolean} [isChalkboard]
 */
function drawGrid(ctx, width, height, camera, gridMode, isChalkboard = false) {
  if (gridMode === 'none') return;

  const step = GRID_SIZE * camera.zoom;
  if (step < 8) return;

  const startX = ((camera.x % step) + step) % step;
  const startY = ((camera.y % step) + step) % step;

  ctx.save();
  if (gridMode === 'dots') {
    ctx.fillStyle = isChalkboard ? 'rgba(241, 245, 249, 0.22)' : '#CBD5E1';
    for (let x = startX; x < width; x += step) {
      for (let y = startY; y < height; y += step) {
        ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
    }
  } else {
    ctx.strokeStyle = isChalkboard ? 'rgba(241, 245, 249, 0.09)' : '#E2E8F0';
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
 * @param {boolean} [isChalkboard]
 */
export function drawFreehandElement(ctx, el, isChalkboard = false) {
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
  ctx.fillStyle = isChalkboard ? toChalkInk(el.strokeColor, 'stroke') : el.strokeColor;
  ctx.fill(new Path2D(pathData));
  ctx.restore();
}

/**
 * Render a connector's label pill (drawn in a dedicated top pass so wires never slice through text).
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../types/schema.js').BoardElement} el
 * @param {Map<string, import('../types/schema.js').BoardElement>} elementsById
 * @param {boolean} [isChalkboard]
 */
export function drawConnectorLabel(ctx, el, elementsById, isChalkboard = false) {
  if (!el.text || !el.text.trim()) return;
  const routed = computeConnectorPath(el, elementsById);
  if (routed.points.length < 2) return;

  ctx.save();
  ctx.globalAlpha = el.opacity;
  const fontSize = Math.min(el.fontSize || 11, 11.5);
  const family = FONT_FAMILY_MAP[isChalkboard ? 'sketch' : el.fontFamily || 'sans'];
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

  if (isChalkboard) {
    // Erase the wire directly behind chalk text so handwriting sits naturally on the slate
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.beginPath();
    ctx.roundRect?.(bx - 1, by - 1, boxW + 2, boxH + 2, 5);
    if (!ctx.roundRect) ctx.rect(bx - 1, by - 1, boxW + 2, boxH + 2);
    ctx.fill();
    ctx.restore();
  } else {
    // Report-clean white knockout mask (Draw.io/Visio style, crisp text without cluttered box borders)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.beginPath();
    ctx.roundRect?.(bx, by, boxW, boxH, 3);
    if (!ctx.roundRect) ctx.rect(bx, by, boxW, boxH);
    ctx.fill();
  }

  ctx.fillStyle = isChalkboard ? '#F3F5F0' : '#0F172A';
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
 * @param {boolean} [isChalkboard]
 * @param {Array<{ x: number, y: number }>} [overridePoints] Precomputed polyline including sharp line jumps
 */
export function drawConnectorElement(
  ctx,
  el,
  elementsById,
  rc,
  drawLabel = true,
  isChalkboard = false,
  overridePoints,
) {
  const routed = computeConnectorPath(el, elementsById);
  const drawPts = overridePoints && overridePoints.length >= 2 ? overridePoints : routed.points;
  const hasJumps = Boolean(overridePoints && overridePoints.length >= 2);
  if (drawPts.length < 2) return;

  const strokeColor = isChalkboard ? toChalkInk(el.strokeColor, 'stroke') : el.strokeColor;

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
    drawConnectorLabel(ctx, el, elementsById, isChalkboard);
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

  const isChalkboard = state.settings.renderMode === 'sketch';

  ctx.save();
  ctx.scale(dpr, dpr);
  if (isChalkboard) {
    drawChalkboardBackground(ctx, cssW, cssH);
  } else {
    ctx.fillStyle = UI_TOKENS.bgCanvas;
    ctx.fillRect(0, 0, cssW, cssH);
    drawGrid(ctx, cssW, cssH, state.camera, state.settings.gridMode, false);
  }

  // Enter world space
  ctx.translate(state.camera.x, state.camera.y);
  ctx.scale(state.camera.zoom, state.camera.zoom);

  const rc = rough.canvas(canvas);
  const elementsById = new Map(state.elements.map((el) => [el.id, el]));

  const renderedAsChalk =
    isChalkboard &&
    drawChalkElementsLayer(ctx, state.elements, {
      widthPx: canvas.width,
      heightPx: canvas.height,
      transform: [
        dpr * state.camera.zoom,
        0,
        0,
        dpr * state.camera.zoom,
        dpr * state.camera.x,
        dpr * state.camera.y,
      ],
      grainOriginX: dpr * state.camera.x,
      grainOriginY: dpr * state.camera.y,
      pixelRatio: dpr,
    });

  if (!renderedAsChalk) {
    const jumpPointsMap = computeConnectorJumpPointsMap(state.elements, elementsById);

    // Draw non-connectors first, then connectors on top
    for (const el of state.elements) {
      if (el.type === 'connector') continue;
      if (el.type === 'freehand') {
        drawFreehandElement(ctx, el, isChalkboard);
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
          isChalkboard,
          jumpPointsMap.get(el.id),
        );
      }
    }

    // Pass 3: Connector labels strictly on top so wires never slice through text
    for (const el of state.elements) {
      if (el.type === 'connector') {
        drawConnectorLabel(ctx, el, elementsById, isChalkboard);
      }
    }
  }

  const uiAccent = isChalkboard ? '#93C5FD' : UI_TOKENS.brandPrimary;

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
