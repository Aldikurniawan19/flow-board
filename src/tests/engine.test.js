import { describe, expect, it } from 'vitest';
import { screenToWorld, snapValue, worldToScreen, zoomAtPoint } from '../engine/camera.js';
import {
  applyResize,
  applyResizeRotated,
  computeAlignmentGuides,
  getElementBounds,
  getRotationHandle,
  hitTestElement,
  hitTestRotationHandle,
  rectsIntersect,
} from '../engine/geometry.js';
import {
  findNearestPort,
  getShapePorts,
  normalizeRotation,
  resolveBindingPoint,
} from '../engine/ports.js';
import { ElementSchema } from '../types/schema.js';
import { computeConnectorJumpPointsMap, computeConnectorPath } from '../engine/router.js';
import {
  exportToSvgString,
  parseAndValidateBoardJson,
  serializeBoardToJson,
} from '../engine/exporter.js';
import {
  SHAPE_CATEGORIES,
  SHAPE_DEFINITIONS,
  createElementFromShape,
  morphElementShape,
} from '../engine/shapeRegistry.js';
import { recognizeFreehandShape } from '../engine/shapeRecognizer.js';
import { buildErdTemplate } from '../constants/templates.js';

describe('camera coordinate math', () => {
  it('roundtrips screen and world coordinates accurately', () => {
    const cam = { x: 120, y: -40, zoom: 1.5 };
    const world = screenToWorld(300, 260, cam);
    expect(world).toEqual({ x: 120, y: 200 });
    expect(worldToScreen(world.x, world.y, cam)).toEqual({ x: 300, y: 260 });
  });

  it('preserves world point under cursor during zoomAtPoint', () => {
    const cam = { x: 50, y: 80, zoom: 1 };
    const pivot = { x: 400, y: 300 };
    const before = screenToWorld(pivot.x, pivot.y, cam);
    const nextCam = zoomAtPoint(cam, 2, pivot.x, pivot.y);
    const after = screenToWorld(pivot.x, pivot.y, nextCam);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('snaps coordinates to grid only when enabled', () => {
    expect(snapValue(33, 20, true)).toBe(40);
    expect(snapValue(33, 20, false)).toBe(33);
  });
});

describe('ports & orthogonal connector routing', () => {
  it('computes 4 cardinal ports and snaps nearest port within threshold', () => {
    const box = createElementFromShape('dfd_gs_process', 200, 200);
    box.x = 100;
    box.y = 100;
    box.width = 160;
    box.height = 80;

    const ports = getShapePorts(box);
    expect(ports.right).toEqual({ x: 260, y: 140 });
    expect(ports.bottom).toEqual({ x: 180, y: 180 });

    const hit = findNearestPort({ x: 265, y: 144 }, [box], new Set(), 20);
    expect(hit).not.toBeNull();
    expect(hit?.elementId).toBe(box.id);
    expect(hit?.side).toBe('right');
  });

  it('attaches connectors flexibly anywhere along a component perimeter and scales on move/resize', () => {
    const table = createElementFromShape('erd_table', 0, 0);
    table.x = 100;
    table.y = 100;
    table.width = 200;
    table.height = 160;

    // Off-center right edge (25% down from top, e.g. aligned with a specific FK row)
    const offCenter = findNearestPort({ x: 304, y: 140 }, [table], new Set(), 20);
    expect(offCenter).not.toBeNull();
    expect(offCenter?.side).toBe('right');
    expect(offCenter?.rx).toBe(1);
    expect(offCenter?.ry).toBeCloseTo(0.25, 2);
    expect(offCenter?.point).toEqual({ x: 300, y: 140 });

    // Moving and resizing the table preserves the proportional anchor point
    table.x = 200;
    table.y = 150;
    table.height = 200;
    const resolved = resolveBindingPoint(table, {
      elementId: table.id,
      side: /** @type {const} */ ('right'),
      rx: offCenter?.rx,
      ry: offCenter?.ry,
    });
    expect(resolved.x).toBe(400);
    expect(resolved.y).toBeCloseTo(200, 2);

    // Interior free attachment with allowInterior: true
    const interior = findNearestPort({ x: 260, y: 210 }, [table], new Set(), 20, {
      allowInterior: true,
    });
    expect(interior).not.toBeNull();
    expect(interior?.rx).toBeCloseTo(0.3, 2);
    expect(interior?.ry).toBeCloseTo(0.3, 2);
  });

  it('routes bound elbow connectors using purely orthogonal 90-degree segments', () => {
    const src = createElementFromShape('erd_table', 0, 0);
    src.x = 0;
    src.y = 0;
    src.width = 200;
    src.height = 100;

    const dst = createElementFromShape('erd_table', 0, 0);
    dst.x = 340;
    dst.y = 180;
    dst.width = 200;
    dst.height = 100;

    const conn = {
      id: 'c1',
      type: 'connector',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      strokeColor: '#0F172A',
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: /** @type {const} */ ('solid'),
      roughness: 0,
      opacity: 1,
      seed: 1,
      routing: /** @type {const} */ ('elbow'),
      startMarker: /** @type {const} */ ('crow_one_only'),
      endMarker: /** @type {const} */ ('crow_zero_many'),
      startBinding: { elementId: src.id, side: /** @type {const} */ ('right') },
      endBinding: { elementId: dst.id, side: /** @type {const} */ ('left') },
    };

    const map = new Map([
      [src.id, src],
      [dst.id, dst],
      [conn.id, conn],
    ]);

    const routed = computeConnectorPath(conn, map);
    expect(routed.points[0]).toEqual({ x: 200, y: 50 });
    expect(routed.points[routed.points.length - 1]).toEqual({ x: 340, y: 230 });

    for (let i = 0; i < routed.points.length - 1; i += 1) {
      const a = routed.points[i];
      const b = routed.points[i + 1];
      const isOrthogonal = Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01;
      expect(isOrthogonal).toBe(true);
    }
    expect(routed.cornerHandles.length).toBeGreaterThan(0);
    expect(routed.midpointHandles.length).toBeGreaterThan(0);

    // Custom user waypoints override auto-routing flexibly across elbow, straight, and curved modes
    const customConn = {
      ...conn,
      waypoints: [
        { x: 250, y: 50 },
        { x: 250, y: 300 },
        { x: 310, y: 300 },
      ],
    };
    const customElbow = computeConnectorPath(customConn, map);
    expect(customElbow.points).toEqual([
      { x: 200, y: 50 },
      { x: 250, y: 50 },
      { x: 250, y: 300 },
      { x: 310, y: 300 },
      { x: 340, y: 230 },
    ]);
    expect(customElbow.cornerHandles).toHaveLength(3);
    expect(customElbow.cornerHandles[0].isCustom).toBe(true);

    const customCurved = computeConnectorPath({ ...customConn, routing: 'curved' }, map);
    expect(customCurved.points.length).toBeGreaterThan(10);
    expect(customCurved.points[0]).toEqual({ x: 200, y: 50 });
    expect(customCurved.points[customCurved.points.length - 1]).toEqual({ x: 340, y: 230 });
  });
});

describe('geometry hit testing, resize, and alignment guides', () => {
  it('hit-tests shapes, enforces minimum resize size, and aligns nearby centers', () => {
    const el = createElementFromShape('fc_decision', 200, 200);
    el.x = 100;
    el.y = 100;
    el.width = 120;
    el.height = 80;

    const map = new Map([[el.id, el]]);
    expect(hitTestElement({ x: 160, y: 140 }, el, map)).toBe(true);
    expect(hitTestElement({ x: 400, y: 400 }, el, map)).toBe(false);

    const resized = applyResize({ x: 100, y: 100, width: 100, height: 80 }, 'nw', 200, 200, 30);
    expect(resized.width).toBe(30);
    expect(resized.height).toBe(30);

    const aligned = computeAlignmentGuides(
      { x: 103, y: 250, width: 120, height: 80 },
      [{ x: 100, y: 100, width: 120, height: 80 }],
      6,
    );
    expect(aligned.dx).toBe(-3);
    expect(aligned.guides.length).toBe(1);
    expect(rectsIntersect({ x: 0, y: 0, width: 50, height: 50 }, { x: 40, y: 40, width: 50, height: 50 })).toBe(true);
  });
});

describe('exporter & Zod schema validation', () => {
  it('roundtrips valid FlowBoard JSON documents', () => {
    const erdElements = buildErdTemplate();
    const json = serializeBoardToJson({
      title: 'ERD E-Commerce',
      settings: {
        renderMode: 'clean',
        gridMode: 'dots',
        snapToGrid: true,
        autoCorrectShapes: true,
        syncSameType: true,
      },
      elements: erdElements,
    });

    const parsed = parseAndValidateBoardJson(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.title).toBe('ERD E-Commerce');
      expect(parsed.data.elements.length).toBe(erdElements.length);
    }
  });

  it('rejects malformed JSON and unknown element types', () => {
    const badJson = parseAndValidateBoardJson('{not valid json');
    expect(badJson.ok).toBe(false);

    const badType = parseAndValidateBoardJson(
      JSON.stringify({
        version: 1,
        title: 'Bad',
        elements: [{ id: '1', type: 'script_injection', x: 0, y: 0, width: 10, height: 10 }],
      }),
    );
    expect(badType.ok).toBe(false);
  });

  it('escapes XML/HTML characters safely during SVG export', () => {
    const el = createElementFromShape('rectangle', 100, 100);
    el.text = '<script>alert("xss")</script>';
    const svg = exportToSvgString([el], { background: '#FFFFFF' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });
});

/**
 * Interpolate a closed polygon path with slight deterministic hand-drawn wobble.
 * @param {Array<{ x: number, y: number }>} vertices
 * @param {number} [stepsPerEdge]
 */
function tracePolygon(vertices, stepsPerEdge = 12) {
  /** @type {Array<{ x: number, y: number }>} */
  const pts = [];
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    for (let s = 0; s < stepsPerEdge; s += 1) {
      const t = s / stepsPerEdge;
      const wobble = Math.sin((i * stepsPerEdge + s) * 1.7) * 2.5;
      pts.push({
        x: a.x + (b.x - a.x) * t + wobble,
        y: a.y + (b.y - a.y) * t - wobble * 0.6,
      });
    }
  }
  pts.push({ x: vertices[0].x + 3, y: vertices[0].y + 2 });
  return pts;
}

describe('freehand auto-shape recognition', () => {
  it('recognizes a hand-drawn circle and snaps to equal width & height', () => {
    const pts = [];
    for (let i = 0; i <= 48; i += 1) {
      const a = (i / 48) * Math.PI * 2;
      const jitter = Math.sin(i * 3) * 3;
      pts.push({ x: 200 + (62 + jitter) * Math.cos(a), y: 180 + (58 - jitter) * Math.sin(a) });
    }
    const res = recognizeFreehandShape(pts);
    expect(res).not.toBeNull();
    expect(res?.type).toBe('ellipse');
    expect(res?.label).toBe('Lingkaran');
    expect(res?.width).toBe(res?.height);
  });

  it('recognizes an elongated oval as ellipse', () => {
    const pts = [];
    for (let i = 0; i <= 48; i += 1) {
      const a = (i / 48) * Math.PI * 2;
      pts.push({ x: 300 + 100 * Math.cos(a), y: 200 + 45 * Math.sin(a) });
    }
    const res = recognizeFreehandShape(pts);
    expect(res?.type).toBe('ellipse');
    expect(res?.label).toBe('Elips');
    expect((res?.width || 0) > (res?.height || 0) * 1.5).toBe(true);
  });

  it('recognizes rectangle, diamond, triangle, hexagon, and straight line', () => {
    const rectPts = tracePolygon([
      { x: 100, y: 100 },
      { x: 280, y: 100 },
      { x: 280, y: 200 },
      { x: 100, y: 200 },
    ]);
    expect(recognizeFreehandShape(rectPts)?.type).toBe('rectangle');

    const diamondPts = tracePolygon([
      { x: 200, y: 80 },
      { x: 290, y: 160 },
      { x: 200, y: 240 },
      { x: 110, y: 160 },
    ]);
    expect(recognizeFreehandShape(diamondPts)?.type).toBe('diamond');

    const triPts = tracePolygon([
      { x: 200, y: 80 },
      { x: 290, y: 220 },
      { x: 110, y: 220 },
    ]);
    expect(recognizeFreehandShape(triPts)?.type).toBe('triangle');

    const hexPts = tracePolygon([
      { x: 140, y: 100 },
      { x: 240, y: 100 },
      { x: 280, y: 160 },
      { x: 240, y: 220 },
      { x: 140, y: 220 },
      { x: 100, y: 160 },
    ]);
    expect(recognizeFreehandShape(hexPts)?.type).toBe('hexagon');

    const linePts = Array.from({ length: 20 }, (_, i) => ({
      x: 50 + i * 10,
      y: 100 + i * 4 + Math.sin(i) * 1.5,
    }));
    const lineRes = recognizeFreehandShape(linePts);
    expect(lineRes?.type).toBe('connector');
    expect(lineRes?.label).toBe('Garis Lurus');
  });

  it('returns null for handwriting-like open curves or tiny marks', () => {
    // Letter 'S' curve
    const sCurve = Array.from({ length: 30 }, (_, i) => {
      const t = i / 29;
      return { x: 100 + Math.sin(t * Math.PI * 2) * 40, y: 80 + t * 140 };
    });
    expect(recognizeFreehandShape(sCurve)).toBeNull();

    // Tiny dot/letter o (< 32px)
    const tiny = Array.from({ length: 20 }, (_, i) => {
      const a = (i / 19) * Math.PI * 2;
      return { x: 50 + 8 * Math.cos(a), y: 50 + 8 * Math.sin(a) };
    });
    expect(recognizeFreehandShape(tiny)).toBeNull();
  });
});

describe('360-degree symbol rotation', () => {
  it('rotates hit-testing, bounding box, rotation knob, connector ports, resize, and SVG export', () => {
    // 200x40 wide horizontal bar centered at (200, 120) rotated 90° becomes 40x200 vertical bar
    const bar = createElementFromShape('rectangle', 200, 120);
    bar.x = 100;
    bar.y = 100;
    bar.width = 200;
    bar.height = 40;
    bar.rotation = 90;

    expect(ElementSchema.safeParse(bar).success).toBe(true);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(405)).toBe(45);

    const map = new Map([[bar.id, bar]]);
    // Point at (200, 30) is inside the rotated 90° vertical bar (y spans 20..220), NOT inside unrotated 100..140
    expect(hitTestElement({ x: 200, y: 30 }, bar, map)).toBe(true);
    // Point at (110, 120) was inside unrotated bar, but is outside the rotated 90° vertical bar
    expect(hitTestElement({ x: 110, y: 120 }, bar, map)).toBe(false);

    // Rotated AABB swaps width & height
    const aabb = getElementBounds(bar, map);
    expect(Math.round(aabb.width)).toBe(40);
    expect(Math.round(aabb.height)).toBe(200);

    // Rotation knob moves to the right of the shape at 90° and hit-tests cleanly
    const knob = getRotationHandle({ x: 100, y: 100, width: 200, height: 40 }, 1, 90);
    expect(knob.x).toBeGreaterThan(220);
    expect(Math.round(knob.y)).toBe(120);
    expect(hitTestRotationHandle(knob, { x: 100, y: 100, width: 200, height: 40 }, 1, 90)).toBe(true);

    // Ports & bound connector points rotate cleanly around center (200, 120)
    const ports = getShapePorts(bar);
    expect(Math.round(ports.right.x)).toBe(200);
    expect(Math.round(ports.right.y)).toBe(220);
    const bound = resolveBindingPoint(bar, { elementId: bar.id, side: 'right', rx: 1, ry: 0.5 });
    expect(Math.round(bound.x)).toBe(200);
    expect(Math.round(bound.y)).toBe(220);

    // Resizing east handle downward by +40px on a 90°-rotated bar increases its local width to 240
    const resized = applyResizeRotated(
      { x: 100, y: 100, width: 200, height: 40 },
      'e',
      0,
      40,
      90,
      24,
    );
    expect(Math.round(resized.width)).toBe(240);
    expect(Math.round(resized.height)).toBe(40);

    // SVG export wraps rotated element in <g transform="rotate(90 200 120)">
    const svg = exportToSvgString([bar]);
    expect(svg).toContain('transform="rotate(90 200 120)"');
  });

  it('morphs a shape into another symbol while keeping id, text, rotation, and adding structural defaults', () => {
    const rect = createElementFromShape('rectangle', 200, 150);
    rect.text = 'Proses Pesanan';
    rect.rotation = 30;

    const toOval = morphElementShape(rect, 'dfd_yd_process');
    expect(toOval).not.toBeNull();
    expect(toOval?.type).toBe('dfd_yd_process');
    expect(toOval?.code).toBe('1.0');

    const toErd = morphElementShape(rect, 'erd_table');
    expect(toErd?.type).toBe('erd_table');
    expect(toErd?.fields?.length).toBeGreaterThan(0);

    // Locked or same-type elements return null cleanly
    expect(morphElementShape({ ...rect, locked: true }, 'ellipse')).toBeNull();
    expect(morphElementShape(rect, 'rectangle')).toBeNull();
  });

  it('inserts sharp triangular line jumps (/\\) on only one of two crossing connectors', () => {
    /** @type {import('../types/schema.js').BoardElement} */
    const vert = {
      id: 'c-vert',
      type: 'connector',
      x: 200,
      y: 100,
      width: 0,
      height: 200,
      strokeColor: '#0F172A',
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 1,
      seed: 1,
      routing: 'straight',
      startMarker: 'none',
      endMarker: 'filled_arrow',
    };
    /** @type {import('../types/schema.js').BoardElement} */
    const horiz = {
      ...vert,
      id: 'c-horiz',
      x: 100,
      y: 200,
      width: 200,
      height: 0,
    };

    const map = new Map([
      [vert.id, vert],
      [horiz.id, horiz],
    ]);
    const jumps = computeConnectorJumpPointsMap([vert, horiz], map);

    // Lower connector stays straight; upper horizontal connector jumps cleanly over (200, 200)
    expect(jumps.has(vert.id)).toBe(false);
    const pts = jumps.get(horiz.id);
    expect(pts).toBeDefined();
    // [start(100,200), jumpStart(194,200), sharpApex(200,192.5), jumpEnd(206,200), end(300,200)]
    expect(pts).toHaveLength(5);
    expect(pts?.[2].x).toBeCloseTo(200, 1);
    expect(pts?.[2].y).toBeCloseTo(192.5, 1);

    // SVG export emits sharp miter-joined jump vertices
    const svg = exportToSvgString([vert, horiz]);
    expect(svg).toContain('stroke-linejoin="miter"');
    expect(svg).toContain('200.0,192.5');
  });

  it('registers schema-valid Rich Picture, BPMN 2.0, UML 2.5, and Architecture symbols with SVG export', () => {
    const categoryIds = SHAPE_CATEGORIES.map((c) => c.id);
    expect(categoryIds).toContain('rich_picture');
    expect(categoryIds).toContain('bpmn');

    const richPictureTypes = SHAPE_DEFINITIONS.filter((d) => d.category === 'rich_picture').map(
      (d) => d.type,
    );
    expect(richPictureTypes).toEqual(
      expect.arrayContaining([
        'rp_stakeholder',
        'rp_thought',
        'rp_speech',
        'rp_conflict',
        'rp_eye',
        'rp_crisis',
      ]),
    );

    const bpmnTypes = SHAPE_DEFINITIONS.filter((d) => d.category === 'bpmn').map((d) => d.type);
    expect(bpmnTypes).toEqual(
      expect.arrayContaining([
        'bpmn_start',
        'bpmn_intermediate',
        'bpmn_end',
        'bpmn_task',
        'bpmn_gateway_xor',
        'bpmn_gateway_and',
        'bpmn_data_object',
        'bpmn_pool',
      ]),
    );

    // Every registered shape produces a schema-valid element, has a preview icon, and exports cleanly to SVG
    const created = SHAPE_DEFINITIONS.map((def, idx) => {
      expect(def.preview.length, `${def.type} must have preview primitives`).toBeGreaterThan(0);
      const el = createElementFromShape(def.type, 100 + idx * 40, 100);
      const parsed = ElementSchema.safeParse(el);
      expect(parsed.success, `${def.type} must satisfy ElementSchema`).toBe(true);
      return el;
    });

    const svg = exportToSvgString(created);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('Konflik');
    expect(svg).toContain('App Server');
  });
});
