/**
 * Draw a connector endpoint marker on HTML5 2D Canvas.
 * Local coordinates place the tip at (0, 0) pointing along +X (rotated by `angle`).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number }} tip
 * @param {number} angle
 * @param {import('../types/schema.js').MarkerType | undefined} markerType
 * @param {string} strokeColor
 * @param {number} strokeWidth
 */
export function drawCanvasMarker(ctx, tip, angle, markerType, strokeColor, strokeWidth) {
  if (!markerType || markerType === 'none') return;

  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(angle);
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = strokeColor;
  ctx.lineWidth = Math.max(1.5, strokeWidth);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  switch (markerType) {
    case 'arrow':
      ctx.beginPath();
      ctx.moveTo(-12, -6);
      ctx.lineTo(0, 0);
      ctx.lineTo(-12, 6);
      ctx.stroke();
      break;

    case 'filled_arrow':
      ctx.beginPath();
      ctx.moveTo(-12, -6);
      ctx.lineTo(0, 0);
      ctx.lineTo(-12, 6);
      ctx.closePath();
      ctx.fill();
      break;

    case 'hollow_triangle':
      ctx.beginPath();
      ctx.moveTo(-14, -7);
      ctx.lineTo(0, 0);
      ctx.lineTo(-14, 7);
      ctx.closePath();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.stroke();
      break;

    case 'circle':
      ctx.beginPath();
      ctx.arc(-5, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'diamond':
    case 'filled_diamond':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-8, -5.5);
      ctx.lineTo(-16, 0);
      ctx.lineTo(-8, 5.5);
      ctx.closePath();
      ctx.fill();
      break;

    case 'hollow_diamond':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-8, -5.5);
      ctx.lineTo(-16, 0);
      ctx.lineTo(-8, 5.5);
      ctx.closePath();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.stroke();
      break;

    case 'crow_one':
      ctx.beginPath();
      ctx.moveTo(-8, -7);
      ctx.lineTo(-8, 7);
      ctx.stroke();
      break;

    case 'crow_one_only':
      ctx.beginPath();
      ctx.moveTo(-6, -7);
      ctx.lineTo(-6, 7);
      ctx.moveTo(-12, -7);
      ctx.lineTo(-12, 7);
      ctx.stroke();
      break;

    case 'crow_zero_one':
      ctx.beginPath();
      ctx.moveTo(-6, -7);
      ctx.lineTo(-6, 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-14, 0, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.stroke();
      break;

    case 'crow_many':
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(0, -7);
      ctx.moveTo(-12, 0);
      ctx.lineTo(0, 7);
      ctx.stroke();
      break;

    case 'crow_one_many':
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(0, -7);
      ctx.moveTo(-12, 0);
      ctx.lineTo(0, 7);
      ctx.moveTo(-13, -7);
      ctx.lineTo(-13, 7);
      ctx.stroke();
      break;

    case 'crow_zero_many':
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(0, -7);
      ctx.moveTo(-12, 0);
      ctx.lineTo(0, 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-18, 0, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.stroke();
      break;

    default:
      break;
  }

  ctx.restore();
}

/**
 * Build safe SVG elements for a connector marker (used by SVG exporter).
 * @param {{ x: number, y: number }} tip
 * @param {number} angle
 * @param {import('../types/schema.js').MarkerType | undefined} markerType
 * @param {string} strokeColor
 * @param {number} strokeWidth
 * @returns {string}
 */
export function buildSvgMarker(tip, angle, markerType, strokeColor, strokeWidth) {
  if (!markerType || markerType === 'none') return '';
  const deg = (angle * 180) / Math.PI;
  const sw = Math.max(1.5, strokeWidth);
  const transform = `translate(${tip.x.toFixed(1)}, ${tip.y.toFixed(1)}) rotate(${deg.toFixed(1)})`;

  let inner = '';
  switch (markerType) {
    case 'arrow':
      inner = `<path d="M -12 -6 L 0 0 L -12 6" fill="none" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" />`;
      break;
    case 'filled_arrow':
      inner = `<polygon points="-12,-6 0,0 -12,6" fill="${strokeColor}" />`;
      break;
    case 'hollow_triangle':
      inner = `<polygon points="-14,-7 0,0 -14,7" fill="#FFFFFF" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round" />`;
      break;
    case 'circle':
      inner = `<circle cx="-5" cy="0" r="4.5" fill="${strokeColor}" />`;
      break;
    case 'diamond':
    case 'filled_diamond':
      inner = `<polygon points="0,0 -8,-5.5 -16,0 -8,5.5" fill="${strokeColor}" />`;
      break;
    case 'hollow_diamond':
      inner = `<polygon points="0,0 -8,-5.5 -16,0 -8,5.5" fill="#FFFFFF" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round" />`;
      break;
    case 'crow_one':
      inner = `<line x1="-8" y1="-7" x2="-8" y2="7" stroke="${strokeColor}" stroke-width="${sw}" />`;
      break;
    case 'crow_one_only':
      inner = `<line x1="-6" y1="-7" x2="-6" y2="7" stroke="${strokeColor}" stroke-width="${sw}" /><line x1="-12" y1="-7" x2="-12" y2="7" stroke="${strokeColor}" stroke-width="${sw}" />`;
      break;
    case 'crow_zero_one':
      inner = `<line x1="-6" y1="-7" x2="-6" y2="7" stroke="${strokeColor}" stroke-width="${sw}" /><circle cx="-14" cy="0" r="4.5" fill="#FFFFFF" stroke="${strokeColor}" stroke-width="${sw}" />`;
      break;
    case 'crow_many':
      inner = `<path d="M -12 0 L 0 -7 M -12 0 L 0 7" fill="none" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="round" />`;
      break;
    case 'crow_one_many':
      inner = `<path d="M -12 0 L 0 -7 M -12 0 L 0 7 M -13 -7 L -13 7" fill="none" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="round" />`;
      break;
    case 'crow_zero_many':
      inner = `<path d="M -12 0 L 0 -7 M -12 0 L 0 7" fill="none" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="round" /><circle cx="-18" cy="0" r="4.5" fill="#FFFFFF" stroke="${strokeColor}" stroke-width="${sw}" />`;
      break;
    default:
      return '';
  }

  return `<g transform="${transform}">${inner}</g>`;
}
