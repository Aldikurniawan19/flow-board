import '@testing-library/jest-dom/vitest';

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = /** @type {any} */ (
    () => ({
      save: () => {},
      restore: () => {},
      scale: () => {},
      translate: () => {},
      rotate: () => {},
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      bezierCurveTo: () => {},
      arc: () => {},
      ellipse: () => {},
      rect: () => {},
      clip: () => {},
      fill: () => {},
      stroke: () => {},
      setLineDash: () => {},
      fillText: () => {},
      measureText: (t) => ({ width: String(t).length * 7 }),
    })
  );
}
