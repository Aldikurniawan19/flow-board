import rough from 'roughjs';
import getStroke from 'perfect-freehand';
import { BoardDocumentSchema, MAX_IMPORT_FILE_BYTES } from '../types/schema.js';
import { FONT_FAMILY_MAP } from '../constants/tokens.js';
import { getElementBounds } from './geometry.js';
import { buildSvgMarker } from './markers.js';
import { getNormalizedRect } from './ports.js';
import { computeConnectorJumpPointsMap, computeConnectorPath } from './router.js';
import {
  drawConnectorElement,
  drawConnectorLabel,
  drawFreehandElement,
  getSvgPathFromStroke,
} from './canvasRenderer.js';
import { drawShapeElement } from './shapeRegistry.js';

/**
 * Escape text safely for SVG XML nodes.
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Compute overall bounding box enclosing all elements.
 * @param {import('../types/schema.js').BoardElement[]} elements
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function computeSceneBounds(elements) {
  if (elements.length === 0) {
    return { x: 0, y: 0, width: 800, height: 500 };
  }
  const elementsById = new Map(elements.map((e) => [e.id, e]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const b = getElementBounds(el, elementsById);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }

  const pad = 40;
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(200, maxX - minX + pad * 2),
    height: Math.max(150, maxY - minY + pad * 2),
  };
}

/**
 * Export elements to a high-DPI PNG Blob using an offscreen Canvas.
 * @param {import('../types/schema.js').BoardElement[]} elements
 * @param {{ background?: string, scale?: number }} [options]
 * @returns {Promise<Blob>}
 */
export async function exportToPngBlob(elements, options = {}) {
  const scale = options.scale ?? 2;
  const bounds = computeSceneBounds(elements);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(bounds.width * scale);
  canvas.height = Math.ceil(bounds.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Gagal menyiapkan konteks kanvas untuk ekspor PNG.');
  }

  ctx.scale(scale, scale);
  if (options.background && options.background !== 'transparent') {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, bounds.width, bounds.height);
  }

  ctx.translate(-bounds.x, -bounds.y);
  const rc = rough.canvas(canvas);
  const elementsById = new Map(elements.map((e) => [e.id, e]));
  const jumpPointsMap = computeConnectorJumpPointsMap(elements, elementsById);

  for (const el of elements) {
    if (el.type === 'connector') continue;
    if (el.type === 'freehand') {
      drawFreehandElement(ctx, el);
    } else {
      drawShapeElement(ctx, rc, el);
    }
  }
  for (const el of elements) {
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
  for (const el of elements) {
    if (el.type === 'connector') {
      drawConnectorLabel(ctx, el, elementsById);
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Gagal menghasilkan berkas PNG.'));
      } else {
        resolve(blob);
      }
    }, 'image/png');
  });
}

/**
 * Export elements to a self-contained, XML-safe SVG string.
 * @param {import('../types/schema.js').BoardElement[]} elements
 * @param {{ background?: string }} [options]
 * @returns {string}
 */
export function exportToSvgString(elements, options = {}) {
  const bounds = computeSceneBounds(elements);
  const elementsById = new Map(elements.map((e) => [e.id, e]));
  /** @type {string[]} */
  const parts = [];

  if (options.background && options.background !== 'transparent') {
    parts.push(
      `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${escapeXml(options.background)}" />`,
    );
  }

  for (const el of elements) {
    if (el.type === 'connector') continue;
    if (el.type === 'freehand' && el.points && el.points.length > 0) {
      const worldPts = el.points.map((p) => [el.x + p.x, el.y + p.y]);
      const stroke = getStroke(worldPts, {
        size: el.isHighlighter ? el.strokeWidth * 6 : el.strokeWidth * 2.2,
        thinning: el.isHighlighter ? 0 : 0.45,
        smoothing: 0.55,
      });
      const d = getSvgPathFromStroke(stroke);
      const op = el.isHighlighter ? Math.min(0.35, el.opacity) : el.opacity;
      parts.push(
        `<path d="${escapeXml(d)}" fill="${escapeXml(el.strokeColor)}" opacity="${op}" />`,
      );
      continue;
    }

    const r = getNormalizedRect(el);
    const fill = el.fillColor === 'transparent' ? 'none' : escapeXml(el.fillColor);
    const stroke = escapeXml(el.strokeColor);
    const dash =
      el.strokeStyle === 'dashed'
        ? ' stroke-dasharray="8 6"'
        : el.strokeStyle === 'dotted'
          ? ' stroke-dasharray="2 5"'
          : '';
    const fontFamily = escapeXml(FONT_FAMILY_MAP[el.fontFamily || 'sans']);
    const fontSize = el.fontSize || 14;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const rot = el.rotation || 0;
    if (rot) {
      parts.push(`<g transform="rotate(${rot} ${cx} ${cy})">`);
    }

    if (
      el.type === 'ellipse' ||
      el.type === 'uml_usecase' ||
      el.type === 'dfd_yd_process' ||
      (el.type.startsWith('erd_chen_') && el.type.includes('attr'))
    ) {
      parts.push(
        `<ellipse cx="${cx}" cy="${cy}" rx="${r.width / 2}" ry="${r.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${el.strokeWidth}"${dash} />`,
      );
    } else if (
      el.type === 'diamond' ||
      el.type === 'fc_decision' ||
      el.type === 'erd_chen_relation' ||
      el.type === 'erd_chen_id_relation'
    ) {
      const pts = `${cx},${r.y} ${r.x + r.width},${cy} ${cx},${r.y + r.height} ${r.x},${cy}`;
      parts.push(
        `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${el.strokeWidth}"${dash} />`,
      );
    } else if (el.type === 'erd_table' || el.type === 'erd_weak_table') {
      const headerH = 34;
      const fields = el.fields || [];
      parts.push(
        `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="6" fill="${fill === 'none' ? '#FFFFFF' : fill}" stroke="${stroke}" stroke-width="${el.strokeWidth}" />`,
      );
      parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${headerH}" fill="#F1F5F9" stroke="${stroke}" stroke-width="1" />`);
      parts.push(
        `<text x="${cx}" y="${r.y + 21}" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize}" font-weight="600" fill="#0F172A">${escapeXml(el.text || 'entity')}</text>`,
      );
      fields.forEach((f, idx) => {
        const y = r.y + headerH + idx * 24 + 16;
        if (y > r.y + r.height) return;
        const label = [f.key, f.name, f.type].filter(Boolean).join('  ');
        parts.push(
          `<text x="${r.x + 10}" y="${y}" font-family="${fontFamily}" font-size="12" fill="#0F172A">${escapeXml(label)}</text>`,
        );
      });
      if (rot) parts.push('</g>');
      continue;
    } else if (el.type !== 'text') {
      const rx = el.type === 'fc_terminator' ? r.height / 2 : el.type === 'rounded_rect' || el.type === 'dfd_gs_process' ? 10 : 2;
      parts.push(
        `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${el.strokeWidth}"${dash} />`,
      );
    }

    if (el.text) {
      parts.push(
        `<text x="${cx}" y="${cy + fontSize * 0.35}" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize}" fill="#0F172A">${escapeXml(el.text)}</text>`,
      );
    }
    if (rot) parts.push('</g>');
  }

  const svgJumpMap = computeConnectorJumpPointsMap(elements, elementsById);
  /** @type {string[]} */
  const svgLabels = [];
  for (const el of elements) {
    if (el.type !== 'connector') continue;
    const routed = computeConnectorPath(el, elementsById);
    const drawPts = svgJumpMap.get(el.id) || routed.points;
    const hasJumps = svgJumpMap.has(el.id);
    if (drawPts.length < 2) continue;
    const stroke = escapeXml(el.strokeColor);
    const dash =
      el.strokeStyle === 'dashed'
        ? ' stroke-dasharray="8 6"'
        : el.strokeStyle === 'dotted'
          ? ' stroke-dasharray="2 5"'
          : '';

    if (routed.cubic && !hasJumps) {
      const { start, cp1, cp2, end } = routed.cubic;
      parts.push(
        `<path d="M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}" fill="none" stroke="${stroke}" stroke-width="${el.strokeWidth}"${dash} />`,
      );
    } else {
      const pts = drawPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const join = hasJumps ? 'miter' : 'round';
      parts.push(
        `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${el.strokeWidth}" stroke-linejoin="${join}" stroke-miterlimit="6"${dash} />`,
      );
    }

    const first = routed.points[0];
    const last = routed.points[routed.points.length - 1];
    parts.push(buildSvgMarker(first, routed.startAngle, el.startMarker, stroke, el.strokeWidth));
    parts.push(buildSvgMarker(last, routed.endAngle, el.endMarker, stroke, el.strokeWidth));

    if (el.text && el.text.trim()) {
      svgLabels.push(
        `<text x="${routed.labelPosition.x}" y="${routed.labelPosition.y - 6}" text-anchor="middle" font-family="${escapeXml(FONT_FAMILY_MAP.sans)}" font-size="11.5" fill="#0F172A">${escapeXml(el.text)}</text>`,
      );
    }
  }
  parts.push(...svgLabels);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" width="${bounds.width}" height="${bounds.height}">`,
    ...parts.filter(Boolean),
    '</svg>',
  ].join('\n');
}

/**
 * Serialize board state to formatted FlowBoard JSON document.
 * @param {{ title: string, settings: import('../types/schema.js').BoardSettings, elements: import('../types/schema.js').BoardElement[] }} board
 * @returns {string}
 */
export function serializeBoardToJson(board) {
  return JSON.stringify(
    {
      version: 1,
      title: board.title,
      settings: board.settings,
      elements: board.elements,
    },
    null,
    2,
  );
}

/**
 * Parse and strictly validate imported FlowBoard JSON string using Zod.
 * @param {string} rawText
 * @returns {{ ok: true, data: import('../types/schema.js').BoardDocument } | { ok: false, error: string }}
 */
export function parseAndValidateBoardJson(rawText) {
  if (typeof rawText !== 'string' || rawText.length === 0) {
    return { ok: false, error: 'Berkas kosong atau tidak dapat dibaca.' };
  }
  if (rawText.length > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, error: 'Ukuran berkas melebihi batas maksimum 5 MB.' };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: 'Format berkas bukan JSON yang valid.' };
  }

  const result = BoardDocumentSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return {
      ok: false,
      error: `Struktur diagram tidak valid: ${firstIssue?.path.join('.') || 'root'} (${firstIssue?.message || 'format salah'}).`,
    };
  }

  return { ok: true, data: /** @type {import('../types/schema.js').BoardDocument} */ (result.data) };
}
