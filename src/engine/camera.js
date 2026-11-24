import { MAX_ZOOM, MIN_ZOOM } from '../constants/tokens.js';

/**
 * @typedef {{ x: number, y: number, zoom: number }} Camera
 */

/**
 * Convert screen (canvas-relative pixel) coordinates to world coordinates.
 * @param {number} screenX
 * @param {number} screenY
 * @param {Camera} camera
 * @returns {{ x: number, y: number }}
 */
export function screenToWorld(screenX, screenY, camera) {
  return {
    x: (screenX - camera.x) / camera.zoom,
    y: (screenY - camera.y) / camera.zoom,
  };
}

/**
 * Convert world coordinates to screen coordinates.
 * @param {number} worldX
 * @param {number} worldY
 * @param {Camera} camera
 * @returns {{ x: number, y: number }}
 */
export function worldToScreen(worldX, worldY, camera) {
  return {
    x: worldX * camera.zoom + camera.x,
    y: worldY * camera.zoom + camera.y,
  };
}

/**
 * Clamp zoom factor to allowed bounds.
 * @param {number} zoom
 * @returns {number}
 */
export function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Zoom camera smoothly while preserving the world point under the cursor.
 * @param {Camera} camera
 * @param {number} nextZoom
 * @param {number} pivotScreenX
 * @param {number} pivotScreenY
 * @returns {Camera}
 */
export function zoomAtPoint(camera, nextZoom, pivotScreenX, pivotScreenY) {
  const clamped = clampZoom(nextZoom);
  const worldBefore = screenToWorld(pivotScreenX, pivotScreenY, camera);
  return {
    zoom: clamped,
    x: pivotScreenX - worldBefore.x * clamped,
    y: pivotScreenY - worldBefore.y * clamped,
  };
}

/**
 * Snap a numeric coordinate to the grid when enabled.
 * @param {number} value
 * @param {number} gridSize
 * @param {boolean} enabled
 * @returns {number}
 */
export function snapValue(value, gridSize, enabled) {
  if (!enabled || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}
