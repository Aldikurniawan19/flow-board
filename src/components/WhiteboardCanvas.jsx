import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GRID_SIZE } from '../constants/tokens.js';
import { rerouteAffectedConnectors, rerouteSingleConnector } from '../engine/autoLayout.js';
import { screenToWorld, snapValue, worldToScreen, zoomAtPoint } from '../engine/camera.js';
import { renderCanvasScene } from '../engine/canvasRenderer.js';
import {
  applyResizeRotated,
  computeAlignmentGuides,
  findConnectorLabelAtPoint,
  findOrthoSegmentAtPoint,
  findTopmostElementAtPoint,
  getConnectorLabelRect,
  getElementBounds,
  getQuickConnectHandles,
  getResizeHandles,
  hitTestQuickConnectHandle,
  hitTestResizeHandle,
  hitTestRotationHandle,
  isPointNearQuickConnectZone,
  rectsIntersect,
} from '../engine/geometry.js';
import {
  findNearestPort,
  getNormalizedRect,
  isConnectableElement,
  normalizeRotation,
} from '../engine/ports.js';
import { computeConnectorPath, simplifyConnectorWaypoints } from '../engine/router.js';
import { recognizeFreehandShape } from '../engine/shapeRecognizer.js';
import {
  createConnectorFromPreset,
  createElementFromShape,
  morphElementShape,
} from '../engine/shapeRegistry.js';
import { useBoardStore } from '../store/useBoardStore.js';
import { QuickConnectMenu } from './QuickConnectMenu.jsx';
import { ShapeContextMenu } from './ShapeContextMenu.jsx';

const TOOL_SHORTCUTS = {
  v: 'select',
  h: 'hand',
  p: 'pen',
  m: 'highlighter',
  e: 'eraser',
  r: 'rectangle',
  d: 'diamond',
  o: 'ellipse',
  c: 'connector',
  t: 'text',
  s: 'sticky_note',
};

const ERASER_CURSOR_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
    '<path d="M14.7 3.3a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8l-9.9 9.9a2 2 0 0 1-1.4.6H5.8a1.5 1.5 0 0 1-1.1-.4l-1.4-1.4a2 2 0 0 1 0-2.8L14.7 3.3Z" fill="#FDA4AF" stroke="#0F172A" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M9.6 8.4l6 6-4.8 4.8a2 2 0 0 1-1.4.6H5.8a1.5 1.5 0 0 1-1.1-.4l-1.4-1.4a2 2 0 0 1 0-2.8l6.3-6.8Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<line x1="3" y1="21" x2="17" y2="21" stroke="#64748B" stroke-width="1.6" stroke-linecap="round"/>' +
    '</svg>',
);

const ERASER_CURSOR = `url("data:image/svg+xml,${ERASER_CURSOR_SVG}") 5 19, cell`;

export function WhiteboardCanvas() {
  const canvasRef = useRef(/** @type {HTMLCanvasElement | null} */ (null));
  const interactionRef = useRef(/** @type {any} */ (null));
  const spacePressedRef = useRef(false);

  const [guides, setGuides] = useState(
    /** @type {Array<{ axis: 'x' | 'y', pos: number, from: number, to: number }>} */ ([]),
  );
  const [marquee, setMarquee] = useState(
    /** @type {{ x: number, y: number, width: number, height: number } | null} */ (null),
  );
  const [hoveredPort, setHoveredPort] = useState(
    /** @type {{ elementId: string, side: import('../types/schema.js').PortSide, point: { x: number, y: number } } | null} */ (
      null
    ),
  );
  const [showPortsForId, setShowPortsForId] = useState(/** @type {string | null} */ (null));
  const [hoveredShapeId, setHoveredShapeId] = useState(/** @type {string | null} */ (null));
  const [hoveredQuickConnect, setHoveredQuickConnect] = useState(
    /** @type {{ elementId: string, side: import('../types/schema.js').PortSide, handle: ReturnType<typeof getQuickConnectHandles>[number] } | null} */ (
      null
    ),
  );
  const [quickConnectClickMenu, setQuickConnectClickMenu] = useState(
    /** @type {{ elementId: string, side: import('../types/schema.js').PortSide, handle: ReturnType<typeof getQuickConnectHandles>[number] } | null} */ (
      null
    ),
  );
  const quickConnectMenuHoverRef = useRef(false);
  const quickConnectLeaveTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const [hoveredLabelId, setHoveredLabelId] = useState(/** @type {string | null} */ (null));
  const [draggingLabelId, setDraggingLabelId] = useState(/** @type {string | null} */ (null));
  const [cursorStyle, setCursorStyle] = useState('default');
  const [contextMenu, setContextMenu] = useState(
    /** @type {{ x: number, y: number, currentType: string, selectedCount: number } | null} */ (
      null
    ),
  );

  const elements = useBoardStore((s) => s.elements);
  const camera = useBoardStore((s) => s.camera);
  const settings = useBoardStore((s) => s.settings);
  const theme = useBoardStore((s) => s.theme);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const editingId = useBoardStore((s) => s.editingId);
  const activeTool = useBoardStore((s) => s.activeTool);

  useEffect(() => {
    return () => {
      if (quickConnectLeaveTimerRef.current) {
        clearTimeout(quickConnectLeaveTimerRef.current);
      }
    };
  }, []);

  // Render canvas synchronously on commit so theme View Transitions capture the updated canvas immediately
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    /** @type {string[]} */
    const quickConnectTargetIds = [];
    if (activeTool === 'select' && !editingId && !draggingLabelId && !marquee) {
      /** @param {string | null | undefined} id */
      const addTarget = (id) => {
        if (!id || quickConnectTargetIds.includes(id)) return;
        const el = elements.find((item) => item.id === id);
        if (el && !el.locked && isConnectableElement(el)) {
          quickConnectTargetIds.push(el.id);
        }
      };
      if (selectedIds.length === 1) {
        addTarget(selectedIds[0]);
      }
      addTarget(hoveredShapeId);
      addTarget(quickConnectClickMenu?.elementId);
    }
    renderCanvasScene(canvas, {
      elements,
      camera,
      settings,
      theme,
      selectedIds,
      hoveredPort,
      showPortsForId,
      quickConnectTargetIds,
      hoveredQuickConnect,
      activeQuickConnect: quickConnectClickMenu
        ? { elementId: quickConnectClickMenu.elementId, side: quickConnectClickMenu.side }
        : null,
      hoveredLabelId,
      draggingLabelId,
      guides,
      marquee,
    });
  }, [
    elements,
    camera,
    settings,
    theme,
    selectedIds,
    editingId,
    activeTool,
    hoveredPort,
    showPortsForId,
    hoveredShapeId,
    hoveredQuickConnect,
    quickConnectClickMenu,
    hoveredLabelId,
    draggingLabelId,
    guides,
    marquee,
  ]);

  // Resize observer so canvas adapts cleanly when sidebars toggle or window resizes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const s = useBoardStore.getState();
      renderCanvasScene(canvas, {
        elements: s.elements,
        camera: s.camera,
        settings: s.settings,
        theme: s.theme,
        selectedIds: s.selectedIds,
        hoveredPort: null,
        showPortsForId: null,
        guides: [],
        marquee: null,
      });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Non-passive wheel listener to prevent browser page zoom on Ctrl+Scroll / trackpad pinch
  useEffect(() => {
    /** @param {WheelEvent} e */
    function handleNativeWheel(e) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const store = useBoardStore.getState();

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const pivotX = Math.min(Math.max(e.clientX - rect.left, 0), rect.width || 1);
        const pivotY = Math.min(Math.max(e.clientY - rect.top, 0), rect.height || 1);
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        store.setCamera(zoomAtPoint(store.camera, store.camera.zoom * factor, pivotX, pivotY));
        return;
      }

      if (e.target === canvas) {
        e.preventDefault();
        store.setCamera({
          ...store.camera,
          x: store.camera.x - e.deltaX,
          y: store.camera.y - e.deltaY,
        });
      }
    }

    window.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleNativeWheel);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    /**
     * Zoom canvas around its viewport center.
     * @param {number} nextZoom
     */
    function zoomAroundCenter(nextZoom) {
      const store = useBoardStore.getState();
      const rect = canvasRef.current?.getBoundingClientRect();
      const cx = rect ? rect.width / 2 : window.innerWidth / 2;
      const cy = rect ? rect.height / 2 : window.innerHeight / 2;
      store.setCamera(zoomAtPoint(store.camera, nextZoom, cx, cy));
    }

    /** @param {KeyboardEvent} e */
    function handleKeyDown(e) {
      const store = useBoardStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      // Always intercept Ctrl/Cmd zoom shortcuts so the browser UI does not zoom
      if (mod && (e.key === '+' || e.key === '=' || e.code === 'Equal' || e.code === 'NumpadAdd')) {
        e.preventDefault();
        zoomAroundCenter(store.camera.zoom * 1.15);
        return;
      }
      if (mod && (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract')) {
        e.preventDefault();
        zoomAroundCenter(store.camera.zoom / 1.15);
        return;
      }
      if (mod && (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0')) {
        e.preventDefault();
        zoomAroundCenter(1);
        return;
      }

      const tag = /** @type {HTMLElement | null} */ (e.target)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        spacePressedRef.current = true;
        setCursorStyle('grab');
        return;
      }

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        store.duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        store.copySelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        store.pasteClipboard();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        store.setSelectedIds(store.elements.map((el) => el.id));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.selectedIds.length > 0) {
          e.preventDefault();
          store.deleteSelected();
        }
        return;
      }
      if (e.key === 'Escape') {
        store.setSelectedIds([]);
        store.setEditingId(null);
        store.setActiveTool('select');
        return;
      }

      if (
        !mod &&
        !e.altKey &&
        store.selectedIds.length > 0 &&
        (e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight')
      ) {
        e.preventDefault();
        const step = e.shiftKey ? GRID_SIZE : 2;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const selectedSet = new Set(store.selectedIds);
        const nudgedNodeIds = new Set(
          store.elements
            .filter((el) => selectedSet.has(el.id) && !el.locked && isConnectableElement(el))
            .map((el) => el.id),
        );
        const skipConnIds = new Set(
          store.elements
            .filter(
              (el) =>
                el.type === 'connector' &&
                !el.locked &&
                (selectedSet.has(el.id) ||
                  (el.startBinding &&
                    el.endBinding &&
                    nudgedNodeIds.has(el.startBinding.elementId) &&
                    nudgedNodeIds.has(el.endBinding.elementId))),
            )
            .map((el) => el.id),
        );

        if (!e.repeat) {
          store.commitSnapshot();
        }
        store.setElementsLive((els) => {
          const shifted = els.map((el) => {
            if (el.locked) return el;
            const moveEl = selectedSet.has(el.id) || skipConnIds.has(el.id);
            if (!moveEl) return el;
            return {
              ...el,
              x: el.x + dx,
              y: el.y + dy,
              waypoints: el.waypoints
                ? el.waypoints.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
                : el.waypoints,
              labelPos: el.labelPos ? { x: el.labelPos.x + dx, y: el.labelPos.y + dy } : el.labelPos,
            };
          });
          return rerouteAffectedConnectors(shifted, nudgedNodeIds, {
            fast: false,
            skipConnectorIds: skipConnIds,
          });
        });
        store.scheduleAutosave();
        return;
      }

      if (!mod && !e.altKey) {
        const lowerKey = e.key.toLowerCase();
        if (lowerKey === 'l' && !e.repeat) {
          e.preventDefault();
          /** @type {Array<{ value: import('../types/schema.js').RoutingMode, label: string }>} */
          const routingOrder = [
            { value: 'elbow', label: 'Siku 90° (Orthogonal)' },
            { value: 'straight', label: 'Garis Lurus' },
            { value: 'curved', label: 'Kurva Halus' },
          ];
          const selectedSet = new Set(store.selectedIds);
          const selectedConnectors = store.elements.filter(
            (el) => selectedSet.has(el.id) && el.type === 'connector' && !el.locked,
          );
          const currentRouting =
            selectedConnectors.length > 0
              ? selectedConnectors[0].routing || store.defaultRouting
              : store.defaultRouting;
          const currIdx = routingOrder.findIndex((item) => item.value === currentRouting);
          const nextItem = routingOrder[(currIdx + 1) % routingOrder.length];

          store.setDefaultStyle({ defaultRouting: nextItem.value });
          if (selectedConnectors.length > 0) {
            store.updateSelectedElements(
              (el) => (el.type === 'connector' && !el.locked ? { routing: nextItem.value } : null),
              { syncSameType: false },
            );
          }
          store.setFeedback({ type: 'info', message: `Tipe jalur: ${nextItem.label}` });
          return;
        }
        const mapped = TOOL_SHORTCUTS[lowerKey];
        if (mapped) {
          store.setActiveTool(mapped);
        }
      }
    }

    /** @param {KeyboardEvent} e */
    function handleKeyUp(e) {
      if (e.code === 'Space') {
        spacePressedRef.current = false;
        setCursorStyle('default');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  /**
   * Convert pointer event to canvas-relative screen coordinates.
   * @param {{ clientX: number, clientY: number }} e
   */
  function getScreenPoint(e) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /**
   * Prepare an orthogonal segment slide interaction for an elbow connector so dragging
   * anywhere along the segment (or its midpoint handle) slides it perpendicularly without
   * detaching bound start/end anchors.
   * @param {import('../types/schema.js').BoardElement} conn
   * @param {number} segIdx
   * @param {'horizontal' | 'vertical'} orientation
   * @param {ReturnType<typeof computeConnectorPath>} routed
   * @param {{ x: number, y: number }} startWorld
   */
  function beginOrthoSegmentSlide(conn, segIdx, orientation, routed, startWorld) {
    const baseWaypoints =
      conn.waypoints && conn.waypoints.length > 0
        ? conn.waypoints.map((p) => ({ ...p }))
        : routed.cornerHandles.map((c) => ({ x: c.x, y: c.y }));
    const verts = routed.controlVertices;
    const startsAtAnchor = segIdx === 0;
    const endsAtAnchor = segIdx + 1 === verts.length - 1;
    const preparedWaypoints = [...baseWaypoints];

    let wpIdxA = segIdx - 1;
    let wpIdxB = segIdx;

    if (startsAtAnchor && endsAtAnchor) {
      preparedWaypoints.splice(0, 0, { ...verts[0] }, { ...verts[1] });
      wpIdxA = 0;
      wpIdxB = 1;
    } else if (startsAtAnchor) {
      preparedWaypoints.splice(0, 0, { ...verts[0] });
      wpIdxA = 0;
      wpIdxB = 1;
    } else if (endsAtAnchor) {
      preparedWaypoints.push({ ...verts[verts.length - 1] });
      wpIdxA = segIdx - 1;
      wpIdxB = preparedWaypoints.length - 1;
    }

    interactionRef.current = {
      mode: 'drag-connector-segment',
      id: conn.id,
      axis: orientation === 'vertical' ? 'x' : 'y',
      wpIdxA,
      wpIdxB,
      preparedWaypoints,
      startWorld,
      moved: false,
      historyCommitted: false,
    };
    setCursorStyle(orientation === 'vertical' ? 'ew-resize' : 'ns-resize');
  }

  /** @param {import('react').PointerEvent<HTMLCanvasElement>} e */
  function handlePointerDown(e) {
    // Let onContextMenu handle right-click without altering selection or starting drag
    if (e.button === 2) return;
    if (contextMenu) setContextMenu(null);
    if (quickConnectClickMenu) setQuickConnectClickMenu(null);

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const store = useBoardStore.getState();
    const screen = getScreenPoint(e);
    const world = screenToWorld(screen.x, screen.y, store.camera);
    const elementsById = new Map(store.elements.map((el) => [el.id, el]));

    if (store.editingId) {
      store.setEditingId(null);
    }

    // Panning via Hand tool, Spacebar, or middle mouse button
    if (store.activeTool === 'hand' || spacePressedRef.current || e.button === 1) {
      interactionRef.current = {
        mode: 'pan',
        startScreen: screen,
        initialCamera: { ...store.camera },
      };
      setCursorStyle('grabbing');
      return;
    }

    // Eraser tool
    if (store.activeTool === 'eraser') {
      const hit = findTopmostElementAtPoint(world, store.elements, elementsById, 10 / store.camera.zoom);
      if (hit && !hit.locked) {
        store.deleteElementsByIds([hit.id]);
      }
      interactionRef.current = { mode: 'erase' };
      return;
    }

    // Freehand Pen / Highlighter
    if (store.activeTool === 'pen' || store.activeTool === 'highlighter') {
      const isHighlighter = store.activeTool === 'highlighter';
      const newStroke = {
        id: crypto.randomUUID(),
        type: 'freehand',
        x: world.x,
        y: world.y,
        width: 1,
        height: 1,
        strokeColor: isHighlighter ? '#B45309' : store.defaultStrokeColor,
        fillColor: 'transparent',
        strokeWidth: isHighlighter ? 4 : 2.5,
        strokeStyle: /** @type {const} */ ('solid'),
        roughness: 0,
        opacity: isHighlighter ? 0.35 : 1,
        seed: Math.floor(Math.random() * 1000000) + 1,
        isHighlighter,
        points: [{ x: 0, y: 0 }],
      };
      store.addElement(newStroke, { select: false });
      interactionRef.current = { mode: 'freehand', id: newStroke.id, origin: world };
      return;
    }

    // Connector drawing tool
    if (store.activeTool === 'connector') {
      const snapPort = findNearestPort(world, store.elements, new Set(), 22 / store.camera.zoom, {
        allowInterior: e.altKey,
        centerSnapPx: 6 / store.camera.zoom,
      });
      const startPt = snapPort
        ? snapPort.point
        : {
            x: snapValue(world.x, GRID_SIZE, store.settings.snapToGrid),
            y: snapValue(world.y, GRID_SIZE, store.settings.snapToGrid),
          };
      const conn = {
        id: crypto.randomUUID(),
        type: 'connector',
        x: startPt.x,
        y: startPt.y,
        width: 1,
        height: 1,
        strokeColor: store.defaultStrokeColor,
        fillColor: 'transparent',
        strokeWidth: 2,
        strokeStyle: /** @type {const} */ ('solid'),
        roughness: store.settings.renderMode === 'sketch' ? 1.3 : 0,
        opacity: 1,
        seed: Math.floor(Math.random() * 1000000) + 1,
        text: '',
        routing: store.defaultRouting,
        startMarker: /** @type {const} */ ('none'),
        endMarker: store.defaultEndMarker,
        startBinding: snapPort
          ? { elementId: snapPort.elementId, side: snapPort.side, rx: snapPort.rx, ry: snapPort.ry }
          : null,
        endBinding: null,
      };
      store.addElement(conn);
      interactionRef.current = { mode: 'draw-connector', id: conn.id };
      return;
    }

    // Text tool
    if (store.activeTool === 'text') {
      const snappedX = snapValue(world.x, GRID_SIZE, store.settings.snapToGrid);
      const snappedY = snapValue(world.y, GRID_SIZE, store.settings.snapToGrid);
      const textEl = {
        id: crypto.randomUUID(),
        type: 'text',
        x: snappedX,
        y: snappedY,
        width: 180,
        height: 44,
        strokeColor: store.defaultStrokeColor,
        fillColor: 'transparent',
        strokeWidth: 2,
        strokeStyle: /** @type {const} */ ('solid'),
        roughness: 0,
        opacity: 1,
        seed: Math.floor(Math.random() * 1000000) + 1,
        text: 'Teks baru',
        fontSize: 16,
        fontFamily: store.settings.renderMode === 'sketch' ? /** @type {const} */ ('sketch') : /** @type {const} */ ('sans'),
      };
      store.addElement(textEl);
      store.setActiveTool('select');
      store.setEditingId(textEl.id);
      return;
    }

    // Quick shape drag-to-draw (rectangle, diamond, ellipse, sticky_note, etc.)
    if (store.activeTool !== 'select') {
      const sx = snapValue(world.x, GRID_SIZE, store.settings.snapToGrid);
      const sy = snapValue(world.y, GRID_SIZE, store.settings.snapToGrid);
      const created = createElementFromShape(store.activeTool, sx, sy, {
        renderMode: store.settings.renderMode,
        strokeColor: store.defaultStrokeColor,
        fillColor: store.defaultFillColor,
      });
      created.x = sx;
      created.y = sy;
      created.width = 4;
      created.height = 4;
      store.addElement(created);
      interactionRef.current = { mode: 'draw-shape', id: created.id, startWorld: { x: sx, y: sy } };
      return;
    }

    const isMultiSelectMod = e.shiftKey || e.ctrlKey || e.metaKey;

    // Select mode: check selected connector endpoints or resize handles first (skip when Ctrl/Cmd multi-selecting)
    if (store.selectedIds.length === 1 && !(e.ctrlKey || e.metaKey)) {
      const sel = elementsById.get(store.selectedIds[0]);
      if (sel && !sel.locked) {
        if (sel.type === 'connector') {
          const routed = computeConnectorPath(sel, elementsById);
          const start = routed.points[0];
          const end = routed.points[routed.points.length - 1];
          const r = 10 / store.camera.zoom;
          if (Math.hypot(world.x - start.x, world.y - start.y) <= r) {
            store.commitSnapshot();
            interactionRef.current = {
              mode: 'drag-connector-end',
              id: sel.id,
              which: 'start',
              initialStartBinding: sel.startBinding ? { ...sel.startBinding } : null,
              initialEndBinding: sel.endBinding ? { ...sel.endBinding } : null,
            };
            return;
          }
          if (Math.hypot(world.x - end.x, world.y - end.y) <= r) {
            store.commitSnapshot();
            interactionRef.current = {
              mode: 'drag-connector-end',
              id: sel.id,
              which: 'end',
              initialStartBinding: sel.startBinding ? { ...sel.startBinding } : null,
              initialEndBinding: sel.endBinding ? { ...sel.endBinding } : null,
            };
            return;
          }

          // Hit-test the selected connector's label pill before bend/midpoint handles so labels sitting on the wire are always easy to drag
          const selLabelRect = getConnectorLabelRect(sel, elementsById);
          const labelPad = 6 / store.camera.zoom;
          if (
            selLabelRect &&
            world.x >= selLabelRect.x - labelPad &&
            world.x <= selLabelRect.x + selLabelRect.width + labelPad &&
            world.y >= selLabelRect.y - labelPad &&
            world.y <= selLabelRect.y + selLabelRect.height + labelPad
          ) {
            interactionRef.current = {
              mode: 'drag-connector-label',
              id: sel.id,
              startWorld: world,
              initialLabelPos: { x: selLabelRect.cx, y: selLabelRect.cy },
              moved: false,
              historyCommitted: false,
            };
            setDraggingLabelId(sel.id);
            setCursorStyle('grabbing');
            return;
          }

          // Hit-test existing corner/bend handles
          for (const ch of routed.cornerHandles) {
            if (Math.hypot(world.x - ch.x, world.y - ch.y) <= r) {
              store.commitSnapshot();
              const baseWaypoints =
                sel.waypoints && sel.waypoints.length > 0
                  ? sel.waypoints.map((p) => ({ ...p }))
                  : routed.cornerHandles.map((c) => ({ x: c.x, y: c.y }));
              store.setElementsLive((els) =>
                els.map((el) => (el.id === sel.id ? { ...el, waypoints: baseWaypoints } : el)),
              );
              interactionRef.current = {
                mode: 'drag-connector-waypoint',
                id: sel.id,
                waypointIndex: ch.index,
              };
              return;
            }
          }

          // Hit-test segment midpoint handles:
          // On orthogonal elbow segments (unless Alt is held), slide the entire perpendicular segment
          // smoothly left/right or up/down while keeping both bound endpoints firmly attached.
          for (const mh of routed.midpointHandles) {
            if (Math.hypot(world.x - mh.x, world.y - mh.y) <= r) {
              if ((sel.routing || 'elbow') === 'elbow' && mh.orientation !== 'diagonal' && !e.altKey) {
                beginOrthoSegmentSlide(sel, mh.segmentIndex, mh.orientation, routed, world);
                return;
              }

              store.commitSnapshot();
              const baseWaypoints =
                sel.waypoints && sel.waypoints.length > 0
                  ? sel.waypoints.map((p) => ({ ...p }))
                  : routed.cornerHandles.map((c) => ({ x: c.x, y: c.y }));
              const nextWaypoints = [...baseWaypoints];
              nextWaypoints.splice(mh.insertIndex, 0, { x: mh.x, y: mh.y });
              store.setElementsLive((els) =>
                els.map((el) => (el.id === sel.id ? { ...el, waypoints: nextWaypoints } : el)),
              );
              interactionRef.current = {
                mode: 'drag-connector-waypoint',
                id: sel.id,
                waypointIndex: mh.insertIndex,
              };
              return;
            }
          }

          // Allow dragging ANYWHERE along an orthogonal elbow segment (not only on the midpoint dot)
          if ((sel.routing || 'elbow') === 'elbow' && !e.altKey) {
            const segHit = findOrthoSegmentAtPoint(
              world,
              routed.controlVertices,
              8 / store.camera.zoom,
            );
            if (segHit) {
              beginOrthoSegmentSlide(sel, segHit.segmentIndex, segHit.orientation, routed, world);
              return;
            }
          }
        } else if (sel.type !== 'freehand') {
          const rect = getNormalizedRect(sel);
          const rot = sel.rotation || 0;
          if (hitTestRotationHandle(world, rect, store.camera.zoom, rot)) {
            const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            store.commitSnapshot();
            interactionRef.current = {
              mode: 'rotate',
              id: sel.id,
              elementType: sel.type,
              center,
              initialRotation: rot,
              startAngle: Math.atan2(world.y - center.y, world.x - center.x),
            };
            setCursorStyle('grabbing');
            return;
          }
          const handle = hitTestResizeHandle(world, rect, store.camera.zoom, rot);
          if (handle) {
            store.commitSnapshot();
            interactionRef.current = {
              mode: 'resize',
              id: sel.id,
              elementType: sel.type,
              handle,
              startWorld: world,
              initialRect: rect,
              initialRotation: rot,
            };
            return;
          }
        }
      }
    }

    // Figma/Draw.io-style quick-connect handles on hovered or selected connectable shapes
    if (!isMultiSelectMod) {
      /** @type {string[]} */
      const qcCandidates = [];
      if (hoveredShapeId) qcCandidates.push(hoveredShapeId);
      if (quickConnectClickMenu?.elementId && !qcCandidates.includes(quickConnectClickMenu.elementId)) {
        qcCandidates.push(quickConnectClickMenu.elementId);
      }
      if (store.selectedIds.length === 1 && !qcCandidates.includes(store.selectedIds[0])) {
        qcCandidates.push(store.selectedIds[0]);
      }
      for (const candId of qcCandidates) {
        const candEl = elementsById.get(candId);
        if (!candEl || candEl.locked || !isConnectableElement(candEl)) continue;
        const qc = hitTestQuickConnectHandle(world, candEl, store.camera.zoom);
        if (qc) {
          /** @type {import('../types/schema.js').BoardElement} */
          const conn = {
            id: crypto.randomUUID(),
            type: 'connector',
            x: qc.anchor.x,
            y: qc.anchor.y,
            width: 0,
            height: 0,
            strokeColor: store.defaultStrokeColor,
            fillColor: 'transparent',
            strokeWidth: 2,
            strokeStyle: 'solid',
            roughness: store.settings.renderMode === 'sketch' ? 1.3 : 0,
            opacity: 1,
            seed: Math.floor(Math.random() * 100000),
            text: '',
            routing: store.defaultRouting,
            startMarker: 'none',
            endMarker: store.defaultEndMarker,
            startBinding: {
              elementId: candEl.id,
              side: qc.side,
              rx: qc.rx,
              ry: qc.ry,
            },
            endBinding: null,
          };
          store.addElement(conn);
          setQuickConnectClickMenu(null);
          setHoveredShapeId(null);
          setHoveredQuickConnect(null);
          setHoveredLabelId(null);
          setCursorStyle('crosshair');
          interactionRef.current = {
            mode: 'draw-connector',
            id: conn.id,
            fromQuickConnect: true,
            sourceElementId: candEl.id,
            startAnchor: qc.anchor,
            quickConnectHandle: qc,
          };
          return;
        }
      }
    }

    // Direct 1-click drag on any unlocked connector's text label (even if the connector is not selected yet)
    if (!isMultiSelectMod) {
      const labelHit = findConnectorLabelAtPoint(
        world,
        store.elements,
        elementsById,
        6 / store.camera.zoom,
      );
      if (labelHit && !labelHit.locked) {
        const routed = computeConnectorPath(labelHit, elementsById);
        store.setSelectedIds([labelHit.id]);
        interactionRef.current = {
          mode: 'drag-connector-label',
          id: labelHit.id,
          startWorld: world,
          initialLabelPos: { ...routed.labelPosition },
          moved: false,
          historyCommitted: false,
        };
        setDraggingLabelId(labelHit.id);
        setCursorStyle('grabbing');
        return;
      }
    }

    // Hit test elements
    const hit = findTopmostElementAtPoint(world, store.elements, elementsById, 8 / store.camera.zoom);
    if (hit) {
      let nextSelected = store.selectedIds;
      if (isMultiSelectMod) {
        nextSelected = store.selectedIds.includes(hit.id)
          ? store.selectedIds.filter((id) => id !== hit.id)
          : [...store.selectedIds, hit.id];
      } else if (!store.selectedIds.includes(hit.id)) {
        nextSelected = [hit.id];
      }
      store.setSelectedIds(nextSelected);

      if (!nextSelected.includes(hit.id)) {
        return;
      }

      // Direct 1-click drag anywhere on a bound orthogonal elbow connector segment (even before selecting)
      if (
        !isMultiSelectMod &&
        !e.altKey &&
        nextSelected.length === 1 &&
        hit.type === 'connector' &&
        !hit.locked &&
        (hit.routing || 'elbow') === 'elbow' &&
        (hit.startBinding || hit.endBinding)
      ) {
        const routed = computeConnectorPath(hit, elementsById);
        const segHit = findOrthoSegmentAtPoint(world, routed.controlVertices, 8 / store.camera.zoom);
        if (segHit) {
          beginOrthoSegmentSlide(hit, segHit.segmentIndex, segHit.orientation, routed, world);
          return;
        }
      }

      const movable = nextSelected
        .map((id) => elementsById.get(id))
        .filter((el) => el && !el.locked);
      if (movable.length > 0) {
        const movedNodeIds = new Set(
          movable.filter((el) => isConnectableElement(el)).map((el) => el.id),
        );
        /** @type {Set<string>} */
        const skipConnectorIds = new Set(
          movable.filter((el) => el.type === 'connector').map((el) => el.id),
        );
        // Translate internal connectors rigidly when BOTH of their bound endpoints are dragged together
        const groupInternalConnectors = store.elements.filter(
          (el) =>
            el.type === 'connector' &&
            !el.locked &&
            !skipConnectorIds.has(el.id) &&
            el.startBinding &&
            el.endBinding &&
            movedNodeIds.has(el.startBinding.elementId) &&
            movedNodeIds.has(el.endBinding.elementId),
        );
        for (const conn of groupInternalConnectors) {
          skipConnectorIds.add(conn.id);
        }

        const allMoving = [...movable, ...groupInternalConnectors];
        store.commitSnapshot();
        interactionRef.current = {
          mode: 'move',
          startWorld: world,
          movedNodeIds,
          skipConnectorIds,
          initialPositions: new Map(
            allMoving.map((el) => [
              el.id,
              {
                x: el.x,
                y: el.y,
                waypoints: el.waypoints ? el.waypoints.map((p) => ({ ...p })) : undefined,
                labelPos: el.labelPos ? { ...el.labelPos } : undefined,
              },
            ]),
          ),
          moved: false,
        };
      }
      return;
    }

    // Clicked empty canvas -> marquee box selection
    const baseSelectedIds = isMultiSelectMod ? store.selectedIds : [];
    if (!isMultiSelectMod) {
      store.setSelectedIds([]);
    }
    interactionRef.current = { mode: 'marquee', startWorld: world, baseSelectedIds };
    setMarquee({ x: world.x, y: world.y, width: 0, height: 0 });
  }

  /** @param {import('react').PointerEvent<HTMLCanvasElement>} e */
  function handlePointerMove(e) {
    const store = useBoardStore.getState();
    const screen = getScreenPoint(e);
    const world = screenToWorld(screen.x, screen.y, store.camera);
    const interaction = interactionRef.current;

    if (!interaction) {
      // Hover feedback for flexible connector anchors
      if (store.activeTool === 'connector') {
        if (hoveredShapeId) setHoveredShapeId(null);
        if (hoveredQuickConnect) setHoveredQuickConnect(null);
        const port = findNearestPort(world, store.elements, new Set(), 22 / store.camera.zoom, {
          allowInterior: e.altKey,
          centerSnapPx: 6 / store.camera.zoom,
        });
        setHoveredPort(port);
        if (port) {
          setShowPortsForId(port.elementId);
        } else {
          const map = new Map(store.elements.map((el) => [el.id, el]));
          const hovered = findTopmostElementAtPoint(world, store.elements, map, 10 / store.camera.zoom);
          setShowPortsForId(hovered && isConnectableElement(hovered) ? hovered.id : null);
        }
        setCursorStyle('crosshair');
      } else {
        if (hoveredPort) setHoveredPort(null);
        if (showPortsForId) setShowPortsForId(null);

        if (store.activeTool === 'hand' || spacePressedRef.current) {
          if (hoveredShapeId) setHoveredShapeId(null);
          if (hoveredQuickConnect) setHoveredQuickConnect(null);
          setCursorStyle('grab');
        } else if (store.activeTool === 'select') {
          let nextCursor = 'default';
          let nextHoveredLabelId = /** @type {string | null} */ (null);
          let nextHoveredShapeId = /** @type {string | null} */ (null);
          let nextHoveredQuickConnect =
            /** @type {{ elementId: string, side: import('../types/schema.js').PortSide, handle: ReturnType<typeof getQuickConnectHandles>[number] } | null} */ (
              null
            );
          const map = new Map(store.elements.map((el) => [el.id, el]));

          if (store.selectedIds.length === 1) {
            const sel = map.get(store.selectedIds[0]);
            if (sel && !sel.locked && sel.type === 'connector') {
              const routed = computeConnectorPath(sel, map);
              const handleR = 10 / store.camera.zoom;
              const startPt = routed.points[0];
              const endPt = routed.points[routed.points.length - 1];
              if (
                Math.hypot(world.x - startPt.x, world.y - startPt.y) <= handleR ||
                Math.hypot(world.x - endPt.x, world.y - endPt.y) <= handleR ||
                routed.cornerHandles.some((ch) => Math.hypot(world.x - ch.x, world.y - ch.y) <= handleR)
              ) {
                nextCursor = 'move';
              } else {
                const hitMid = routed.midpointHandles.find(
                  (mh) => Math.hypot(world.x - mh.x, world.y - mh.y) <= handleR,
                );
                if (hitMid) {
                  if ((sel.routing || 'elbow') === 'elbow' && hitMid.orientation === 'vertical') {
                    nextCursor = 'ew-resize';
                  } else if ((sel.routing || 'elbow') === 'elbow' && hitMid.orientation === 'horizontal') {
                    nextCursor = 'ns-resize';
                  } else {
                    nextCursor = 'move';
                  }
                } else if ((sel.routing || 'elbow') === 'elbow') {
                  const segHover = findOrthoSegmentAtPoint(
                    world,
                    routed.controlVertices,
                    8 / store.camera.zoom,
                  );
                  if (segHover) {
                    nextCursor = segHover.orientation === 'vertical' ? 'ew-resize' : 'ns-resize';
                  }
                }
              }
            } else if (sel && !sel.locked && sel.type !== 'connector' && sel.type !== 'freehand') {
              const rect = getNormalizedRect(sel);
              const rot = sel.rotation || 0;
              if (hitTestRotationHandle(world, rect, store.camera.zoom, rot)) {
                nextCursor = 'grab';
              } else {
                const h = hitTestResizeHandle(world, rect, store.camera.zoom, rot);
                if (h) {
                  const found = getResizeHandles(rect, 0).find((item) => item.id === h);
                  nextCursor = found ? found.cursor : 'default';
                }
              }
            }
          }

          // Track hovered connectable shape with an outer margin so moving to quick-connect handles stays stable
          const topHit = findTopmostElementAtPoint(world, store.elements, map, 6 / store.camera.zoom);
          if (topHit && !topHit.locked && isConnectableElement(topHit)) {
            nextHoveredShapeId = topHit.id;
          } else if (hoveredShapeId) {
            const prevHovered = map.get(hoveredShapeId);
            if (
              prevHovered &&
              !prevHovered.locked &&
              isConnectableElement(prevHovered) &&
              isPointNearQuickConnectZone(world, prevHovered, store.camera.zoom)
            ) {
              nextHoveredShapeId = prevHovered.id;
            }
          }

          // Check quick-connect handles (priority right after rotation/resize handles)
          if (nextCursor === 'default') {
            /** @type {string[]} */
            const qcCandidates = [];
            if (nextHoveredShapeId) qcCandidates.push(nextHoveredShapeId);
            if (store.selectedIds.length === 1 && !qcCandidates.includes(store.selectedIds[0])) {
              qcCandidates.push(store.selectedIds[0]);
            }
            for (const candId of qcCandidates) {
              const candEl = map.get(candId);
              if (!candEl || candEl.locked || !isConnectableElement(candEl)) continue;
              const qc = hitTestQuickConnectHandle(world, candEl, store.camera.zoom);
              if (qc) {
                nextHoveredQuickConnect = { elementId: candEl.id, side: qc.side, handle: qc };
                nextHoveredShapeId = candEl.id;
                nextCursor = 'crosshair';
                break;
              }
            }
          }

          if (nextCursor === 'default') {
            const labelHover = findConnectorLabelAtPoint(
              world,
              store.elements,
              map,
              6 / store.camera.zoom,
            );
            if (labelHover && !labelHover.locked) {
              nextHoveredLabelId = labelHover.id;
              nextCursor = 'move';
            } else if (
              topHit &&
              topHit.type === 'connector' &&
              !topHit.locked &&
              (topHit.routing || 'elbow') === 'elbow' &&
              (topHit.startBinding || topHit.endBinding)
            ) {
              const routed = computeConnectorPath(topHit, map);
              const segHover = findOrthoSegmentAtPoint(
                world,
                routed.controlVertices,
                8 / store.camera.zoom,
              );
              if (segHover) {
                nextCursor = segHover.orientation === 'vertical' ? 'ew-resize' : 'ns-resize';
              }
            }
          }

          if (quickConnectLeaveTimerRef.current) {
            clearTimeout(quickConnectLeaveTimerRef.current);
            quickConnectLeaveTimerRef.current = null;
          }
          if (hoveredShapeId !== nextHoveredShapeId) {
            setHoveredShapeId(nextHoveredShapeId);
          }
          if (
            (hoveredQuickConnect?.elementId ?? null) !== (nextHoveredQuickConnect?.elementId ?? null) ||
            (hoveredQuickConnect?.side ?? null) !== (nextHoveredQuickConnect?.side ?? null)
          ) {
            setHoveredQuickConnect(nextHoveredQuickConnect);
          }
          if (hoveredLabelId !== nextHoveredLabelId) {
            setHoveredLabelId(nextHoveredLabelId);
          }
          setCursorStyle(nextCursor);
        } else {
          if (hoveredShapeId) setHoveredShapeId(null);
          if (hoveredQuickConnect) setHoveredQuickConnect(null);
          if (hoveredLabelId) setHoveredLabelId(null);
          setCursorStyle(store.activeTool === 'eraser' ? ERASER_CURSOR : 'crosshair');
        }
      }
      return;
    }

    if (interaction.mode === 'pan') {
      const dx = screen.x - interaction.startScreen.x;
      const dy = screen.y - interaction.startScreen.y;
      store.setCamera({
        ...interaction.initialCamera,
        x: interaction.initialCamera.x + dx,
        y: interaction.initialCamera.y + dy,
      });
      return;
    }

    if (interaction.mode === 'erase') {
      const map = new Map(store.elements.map((el) => [el.id, el]));
      const hit = findTopmostElementAtPoint(world, store.elements, map, 10 / store.camera.zoom);
      if (hit && !hit.locked) {
        store.deleteElementsByIds([hit.id]);
      }
      return;
    }

    if (interaction.mode === 'freehand') {
      const relX = world.x - interaction.origin.x;
      const relY = world.y - interaction.origin.y;
      store.setElementsLive((els) =>
        els.map((el) =>
          el.id === interaction.id
            ? { ...el, points: [...(el.points || []), { x: relX, y: relY }] }
            : el,
        ),
      );
      return;
    }

    if (interaction.mode === 'draw-shape') {
      const curX = snapValue(world.x, GRID_SIZE, store.settings.snapToGrid);
      const curY = snapValue(world.y, GRID_SIZE, store.settings.snapToGrid);
      const x = Math.min(interaction.startWorld.x, curX);
      const y = Math.min(interaction.startWorld.y, curY);
      const width = Math.max(12, Math.abs(curX - interaction.startWorld.x));
      const height = Math.max(12, Math.abs(curY - interaction.startWorld.y));
      store.setElementsLive((els) =>
        els.map((el) => (el.id === interaction.id ? { ...el, x, y, width, height } : el)),
      );
      return;
    }

    if (interaction.mode === 'draw-connector') {
      const excludeIds = new Set([interaction.id]);
      if (
        interaction.fromQuickConnect &&
        interaction.sourceElementId &&
        interaction.startAnchor &&
        Math.hypot(world.x - interaction.startAnchor.x, world.y - interaction.startAnchor.y) <
          18 / store.camera.zoom
      ) {
        excludeIds.add(interaction.sourceElementId);
      }
      const port = findNearestPort(
        world,
        store.elements,
        excludeIds,
        22 / store.camera.zoom,
        { allowInterior: e.altKey, centerSnapPx: 6 / store.camera.zoom },
      );
      setHoveredPort(port);
      setShowPortsForId(port ? port.elementId : null);
      const endPt = port
        ? port.point
        : {
            x: snapValue(world.x, GRID_SIZE, store.settings.snapToGrid),
            y: snapValue(world.y, GRID_SIZE, store.settings.snapToGrid),
          };
      store.setElementsLive((els) => {
        const updated = els.map((el) =>
          el.id === interaction.id
            ? {
                ...el,
                width: endPt.x - el.x,
                height: endPt.y - el.y,
                waypoints: undefined,
                endBinding: port
                  ? { elementId: port.elementId, side: port.side, rx: port.rx, ry: port.ry }
                  : null,
              }
            : el,
        );
        return rerouteSingleConnector(updated, interaction.id, {
          pinnedEnd: 'both',
          allowFlipOpposite: false,
        });
      });
      return;
    }

    if (interaction.mode === 'drag-connector-label') {
      const dx = world.x - interaction.startWorld.x;
      const dy = world.y - interaction.startWorld.y;
      const deadzone = 2 / store.camera.zoom;
      if (!interaction.moved && Math.hypot(dx, dy) < deadzone) {
        return;
      }
      if (!interaction.historyCommitted) {
        store.commitSnapshot();
        interaction.historyCommitted = true;
      }
      interaction.moved = true;

      let nextX = interaction.initialLabelPos.x + dx;
      let nextY = interaction.initialLabelPos.y + dy;
      // Smooth free positioning by default; hold Shift to gently snap to 10px steps
      if (e.shiftKey) {
        nextX = snapValue(nextX, 10, true);
        nextY = snapValue(nextY, 10, true);
      } else {
        nextX = Math.round(nextX);
        nextY = Math.round(nextY);
      }

      store.setElementsLive((els) =>
        els.map((el) =>
          el.id === interaction.id ? { ...el, labelPos: { x: nextX, y: nextY } } : el,
        ),
      );
      return;
    }

    if (interaction.mode === 'drag-connector-end') {
      const port = findNearestPort(
        world,
        store.elements,
        new Set([interaction.id]),
        22 / store.camera.zoom,
        { allowInterior: e.altKey, centerSnapPx: 6 / store.camera.zoom },
      );
      setHoveredPort(port);
      setShowPortsForId(port ? port.elementId : null);
      const targetPt = port
        ? port.point
        : {
            x: snapValue(world.x, GRID_SIZE, store.settings.snapToGrid),
            y: snapValue(world.y, GRID_SIZE, store.settings.snapToGrid),
          };
      store.setElementsLive((els) => {
        const updated = els.map((el) => {
          if (el.id !== interaction.id) return el;
          const nextBinding = port
            ? { elementId: port.elementId, side: port.side, rx: port.rx, ry: port.ry }
            : null;
          if (interaction.which === 'start') {
            const endX = el.x + el.width;
            const endY = el.y + el.height;
            return {
              ...el,
              x: targetPt.x,
              y: targetPt.y,
              width: endX - targetPt.x,
              height: endY - targetPt.y,
              startBinding: nextBinding,
              waypoints: undefined,
              labelPos: null,
            };
          }
          return {
            ...el,
            width: targetPt.x - el.x,
            height: targetPt.y - el.y,
            endBinding: nextBinding,
            waypoints: undefined,
            labelPos: null,
          };
        });
        return rerouteSingleConnector(updated, interaction.id, {
          pinnedEnd: interaction.which,
          allowFlipOpposite: true,
          preferredOppositeBinding:
            interaction.which === 'end'
              ? interaction.initialStartBinding
              : interaction.initialEndBinding,
        });
      });
      return;
    }

    if (interaction.mode === 'drag-connector-segment') {
      const dx = world.x - interaction.startWorld.x;
      const dy = world.y - interaction.startWorld.y;
      const deadzone = 3 / store.camera.zoom;
      if (!interaction.moved && Math.hypot(dx, dy) < deadzone) {
        return;
      }

      const map = new Map(store.elements.map((el) => [el.id, el]));
      const targetConn = map.get(interaction.id);
      if (!targetConn) return;

      if (!interaction.historyCommitted) {
        store.commitSnapshot();
        interaction.historyCommitted = true;
      }
      interaction.moved = true;

      const rawCoord = interaction.axis === 'x' ? world.x : world.y;
      let nextCoord =
        store.settings.snapToGrid && !e.altKey
          ? snapValue(rawCoord, GRID_SIZE, true)
          : rawCoord;

      if (!e.altKey) {
        const routed = computeConnectorPath(targetConn, map);
        const verts = routed.controlVertices;
        const startPt = verts[0];
        const endPt = verts[verts.length - 1];
        const alignTol = 7 / store.camera.zoom;
        const startVal = interaction.axis === 'x' ? startPt.x : startPt.y;
        const endVal = interaction.axis === 'x' ? endPt.x : endPt.y;
        if (Math.abs(nextCoord - startVal) <= alignTol) nextCoord = startVal;
        else if (Math.abs(nextCoord - endVal) <= alignTol) nextCoord = endVal;
      }

      store.setElementsLive((els) =>
        els.map((el) => {
          if (el.id !== interaction.id) return el;
          const sourceWaypoints =
            el.waypoints && el.waypoints.length >= interaction.preparedWaypoints.length
              ? el.waypoints
              : interaction.preparedWaypoints;
          const nextWaypoints = sourceWaypoints.map(
            (/** @type {{ x: number, y: number }} */ pt, /** @type {number} */ idx) => {
              if (idx !== interaction.wpIdxA && idx !== interaction.wpIdxB) return pt;
              return interaction.axis === 'x'
                ? { x: nextCoord, y: pt.y }
                : { x: pt.x, y: nextCoord };
            },
          );
          return { ...el, waypoints: nextWaypoints, labelPos: null };
        }),
      );
      return;
    }

    if (interaction.mode === 'drag-connector-waypoint') {
      const map = new Map(store.elements.map((el) => [el.id, el]));
      const targetConn = map.get(interaction.id);
      if (!targetConn) return;

      let nx = store.settings.snapToGrid && !e.altKey
        ? snapValue(world.x, GRID_SIZE, true)
        : world.x;
      let ny = store.settings.snapToGrid && !e.altKey
        ? snapValue(world.y, GRID_SIZE, true)
        : world.y;

      // Gentle alignment snap to adjacent vertices so sharp 90-degree corners are easy to form
      if (!e.altKey) {
        const routed = computeConnectorPath(targetConn, map);
        const verts = routed.controlVertices;
        const vIdx = interaction.waypointIndex + 1;
        const prev = verts[vIdx - 1];
        const next = verts[vIdx + 1];
        const alignTol = 7 / store.camera.zoom;
        if (prev && Math.abs(nx - prev.x) <= alignTol) nx = prev.x;
        else if (next && Math.abs(nx - next.x) <= alignTol) nx = next.x;
        if (prev && Math.abs(ny - prev.y) <= alignTol) ny = prev.y;
        else if (next && Math.abs(ny - next.y) <= alignTol) ny = next.y;
      }

      store.setElementsLive((els) =>
        els.map((el) => {
          if (el.id !== interaction.id || !el.waypoints) return el;
          const nextWaypoints = el.waypoints.map((pt, idx) =>
            idx === interaction.waypointIndex ? { x: nx, y: ny } : pt,
          );
          return { ...el, waypoints: nextWaypoints, labelPos: null };
        }),
      );
      return;
    }

    if (interaction.mode === 'rotate') {
      const { center } = interaction;
      const curAngle = Math.atan2(world.y - center.y, world.x - center.x);
      const deltaDeg = ((curAngle - interaction.startAngle) * 180) / Math.PI;
      const rawDeg = (interaction.initialRotation || 0) + deltaDeg;
      let nextDeg = normalizeRotation(rawDeg);
      if (e.shiftKey) {
        nextDeg = normalizeRotation(Math.round(nextDeg / 15) * 15);
      } else {
        // Gentle magnetic snap within 3° of 0°/90°/180°/270° for clean alignment
        const nearestCardinal = Math.round(nextDeg / 90) * 90;
        if (Math.abs(nextDeg - nearestCardinal) <= 3) {
          nextDeg = normalizeRotation(nearestCardinal);
        } else {
          nextDeg = normalizeRotation(Math.round(nextDeg));
        }
      }
      store.setElementsLive((els) => {
        const rotatedIds = new Set([interaction.id]);
        const updated = els.map((el) =>
          el.id === interaction.id ? { ...el, rotation: nextDeg } : el,
        );
        interaction.affectedNodeIds = rotatedIds;
        return rerouteAffectedConnectors(updated, rotatedIds, { fast: true });
      });
      return;
    }

    if (interaction.mode === 'resize') {
      const dx = world.x - interaction.startWorld.x;
      const dy = world.y - interaction.startWorld.y;
      const rot = interaction.initialRotation || 0;
      const resized = applyResizeRotated(
        interaction.initialRect,
        interaction.handle,
        dx,
        dy,
        rot,
        28,
      );
      const snapped =
        store.settings.snapToGrid && !rot
          ? {
              x: snapValue(resized.x, GRID_SIZE, true),
              y: snapValue(resized.y, GRID_SIZE, true),
              width: Math.max(28, snapValue(resized.width, GRID_SIZE, true)),
              height: Math.max(28, snapValue(resized.height, GRID_SIZE, true)),
            }
          : resized;
      const syncSameType = store.settings.syncSameType !== false;
      store.setElementsLive((els) => {
        /** @type {Set<string>} */
        const resizedIds = new Set();
        const updated = els.map((el) => {
          if (el.id === interaction.id) {
            resizedIds.add(el.id);
            return { ...el, ...snapped };
          }
          if (syncSameType && el.type === interaction.elementType && !el.locked) {
            resizedIds.add(el.id);
            const rect = getNormalizedRect(el);
            return { ...el, x: rect.x, y: rect.y, width: snapped.width, height: snapped.height };
          }
          return el;
        });
        interaction.affectedNodeIds = resizedIds;
        return rerouteAffectedConnectors(updated, resizedIds, { fast: true });
      });
      return;
    }

    if (interaction.mode === 'move') {
      let dx = world.x - interaction.startWorld.x;
      let dy = world.y - interaction.startWorld.y;
      interaction.moved = true;

      if (store.settings.snapToGrid) {
        dx = snapValue(dx, GRID_SIZE, true);
        dy = snapValue(dy, GRID_SIZE, true);
      }

      // Compute smart alignment guides for single-shape dragging
      if (interaction.movedNodeIds && interaction.movedNodeIds.size === 1) {
        const [movedId] = Array.from(interaction.movedNodeIds);
        const initPos = interaction.initialPositions.get(movedId);
        const movedEl = store.elements.find((el) => el.id === movedId);
        if (initPos && movedEl && isConnectableElement(movedEl)) {
          const candidateRect = {
            ...getNormalizedRect(movedEl),
            x: initPos.x + dx,
            y: initPos.y + dy,
          };
          const otherRects = store.elements
            .filter((el) => el.id !== movedId && isConnectableElement(el))
            .map((el) => getNormalizedRect(el));
          const aligned = computeAlignmentGuides(candidateRect, otherRects, 6 / store.camera.zoom);
          dx += aligned.dx;
          dy += aligned.dy;
          setGuides(aligned.guides);
        }
      }

      store.setElementsLive((els) => {
        const moved = els.map((el) => {
          const init = interaction.initialPositions.get(el.id);
          if (!init) return el;
          const shiftedWaypoints = init.waypoints
            ? init.waypoints.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
            : el.waypoints;
          const shiftedLabelPos = init.labelPos
            ? { x: init.labelPos.x + dx, y: init.labelPos.y + dy }
            : el.labelPos;
          return {
            ...el,
            x: init.x + dx,
            y: init.y + dy,
            waypoints: shiftedWaypoints,
            labelPos: shiftedLabelPos,
          };
        });
        return rerouteAffectedConnectors(moved, interaction.movedNodeIds, {
          fast: true,
          skipConnectorIds: interaction.skipConnectorIds,
        });
      });
      return;
    }

    if (interaction.mode === 'marquee') {
      const rect = {
        x: Math.min(interaction.startWorld.x, world.x),
        y: Math.min(interaction.startWorld.y, world.y),
        width: Math.abs(world.x - interaction.startWorld.x),
        height: Math.abs(world.y - interaction.startWorld.y),
      };
      setMarquee(rect);
      const map = new Map(store.elements.map((el) => [el.id, el]));
      const ids = store.elements
        .filter((el) => rectsIntersect(rect, getElementBounds(el, map)))
        .map((el) => el.id);
      const base = interaction.baseSelectedIds || [];
      store.setSelectedIds(base.length > 0 ? Array.from(new Set([...base, ...ids])) : ids);
    }
  }

  /** @param {import('react').PointerEvent<HTMLCanvasElement>} e */
  function handlePointerUp(e) {
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    const store = useBoardStore.getState();
    const interaction = interactionRef.current;
    interactionRef.current = null;
    setGuides([]);
    setMarquee(null);
    setHoveredPort(null);
    setShowPortsForId(null);
    setDraggingLabelId(null);

    if (!interaction) return;

    if (interaction.mode === 'drag-connector-label') {
      setCursorStyle(store.activeTool === 'select' ? 'move' : 'default');
      if (interaction.moved) {
        store.scheduleAutosave();
      }
      return;
    }

    if (interaction.mode === 'pan') {
      setCursorStyle(
        store.activeTool === 'hand'
          ? 'grab'
          : store.activeTool === 'eraser'
            ? ERASER_CURSOR
            : 'default',
      );
      return;
    }

    if (interaction.mode === 'rotate') {
      setCursorStyle(store.activeTool === 'hand' ? 'grab' : 'default');
      if (interaction.affectedNodeIds && interaction.affectedNodeIds.size > 0) {
        store.setElementsLive((els) =>
          rerouteAffectedConnectors(els, interaction.affectedNodeIds, { fast: false }),
        );
        store.scheduleAutosave();
      }
      return;
    }

    if (interaction.mode === 'draw-shape') {
      // If user clicked without dragging, expand to default shape size
      const el = store.elements.find((item) => item.id === interaction.id);
      if (el && el.width < 20 && el.height < 20) {
        const fallback = createElementFromShape(el.type, el.x, el.y, {
          renderMode: store.settings.renderMode,
        });
        store.updateElementById(
          el.id,
          { x: fallback.x, y: fallback.y, width: fallback.width, height: fallback.height },
          { skipHistory: true },
        );
      } else {
        store.scheduleAutosave();
      }
      store.setActiveTool('select');
      return;
    }

    if (interaction.mode === 'freehand') {
      const strokeEl = store.elements.find((item) => item.id === interaction.id);
      const shouldAutoCorrect =
        strokeEl &&
        !strokeEl.isHighlighter &&
        store.settings.autoCorrectShapes !== false &&
        strokeEl.points &&
        strokeEl.points.length >= 5;

      if (shouldAutoCorrect && strokeEl.points) {
        const worldPts = strokeEl.points.map((p) => ({
          x: strokeEl.x + p.x,
          y: strokeEl.y + p.y,
        }));
        const recognized = recognizeFreehandShape(worldPts);

        if (recognized) {
          const isSketch = store.settings.renderMode === 'sketch';
          if (recognized.type === 'connector') {
            const startPt = { x: recognized.x, y: recognized.y };
            const endPt = {
              x: recognized.x + recognized.width,
              y: recognized.y + recognized.height,
            };
            const others = store.elements.filter((item) => item.id !== strokeEl.id);
            const startPort = findNearestPort(startPt, others, new Set(), 24 / store.camera.zoom);
            const endPort = findNearestPort(endPt, others, new Set(), 24 / store.camera.zoom);
            const resolvedStart = startPort ? startPort.point : startPt;
            const resolvedEnd = endPort ? endPort.point : endPt;

            store.replaceElementWithHistory(strokeEl.id, {
              id: crypto.randomUUID(),
              type: 'connector',
              x: resolvedStart.x,
              y: resolvedStart.y,
              width: resolvedEnd.x - resolvedStart.x,
              height: resolvedEnd.y - resolvedStart.y,
              strokeColor: strokeEl.strokeColor,
              fillColor: 'transparent',
              strokeWidth: strokeEl.strokeWidth,
              strokeStyle: 'solid',
              roughness: isSketch ? 1.3 : 0,
              opacity: strokeEl.opacity,
              seed: strokeEl.seed,
              text: '',
              routing: 'straight',
              startMarker: 'none',
              endMarker: recognized.endMarker || 'none',
              startBinding: startPort
                ? {
                    elementId: startPort.elementId,
                    side: startPort.side,
                    rx: startPort.rx,
                    ry: startPort.ry,
                  }
                : null,
              endBinding: endPort
                ? {
                    elementId: endPort.elementId,
                    side: endPort.side,
                    rx: endPort.rx,
                    ry: endPort.ry,
                  }
                : null,
            });
          } else {
            store.replaceElementWithHistory(strokeEl.id, {
              id: crypto.randomUUID(),
              type: recognized.type,
              x: recognized.x,
              y: recognized.y,
              width: recognized.width,
              height: recognized.height,
              strokeColor: strokeEl.strokeColor,
              fillColor: 'transparent',
              strokeWidth: strokeEl.strokeWidth,
              strokeStyle: 'solid',
              roughness: isSketch ? 1.3 : 0,
              opacity: strokeEl.opacity,
              seed: strokeEl.seed,
              text: '',
              fontSize: 14,
              fontFamily: isSketch ? 'sketch' : 'sans',
            });
          }
          store.setFeedback({
            type: 'info',
            message: `Auto-koreksi: ${recognized.label} (Ctrl+Z untuk goresan asli)`,
          });
          return;
        }
      }

      store.scheduleAutosave();
      return;
    }

    if (
      interaction.mode === 'draw-connector' ||
      interaction.mode === 'drag-connector-end' ||
      interaction.mode === 'drag-connector-waypoint' ||
      (interaction.mode === 'drag-connector-segment' && interaction.moved) ||
      interaction.mode === 'resize' ||
      (interaction.mode === 'move' && interaction.moved)
    ) {
      if (interaction.mode === 'drag-connector-segment') {
        store.setElementsLive((els) => {
          const map = new Map(els.map((item) => [item.id, item]));
          return els.map((el) => {
            if (el.id !== interaction.id || !el.waypoints) return el;
            const routed = computeConnectorPath(el, map);
            const verts = routed.controlVertices;
            const cleanWp = simplifyConnectorWaypoints(
              verts[0],
              el.waypoints,
              verts[verts.length - 1],
            );
            return { ...el, waypoints: cleanWp.length > 0 ? cleanWp : undefined };
          });
        });
        setCursorStyle('default');
      }
      if (interaction.mode === 'move' && interaction.moved && interaction.movedNodeIds?.size > 0) {
        store.setElementsLive((els) =>
          rerouteAffectedConnectors(els, interaction.movedNodeIds, {
            fast: false,
            skipConnectorIds: interaction.skipConnectorIds,
          }),
        );
      } else if (interaction.mode === 'resize' && interaction.affectedNodeIds?.size > 0) {
        store.setElementsLive((els) =>
          rerouteAffectedConnectors(els, interaction.affectedNodeIds, { fast: false }),
        );
      }
      if (interaction.mode === 'drag-connector-end') {
        store.setElementsLive((els) =>
          rerouteSingleConnector(els, interaction.id, {
            pinnedEnd: interaction.which,
            allowFlipOpposite: true,
            preferredOppositeBinding:
              interaction.which === 'end'
                ? interaction.initialStartBinding
                : interaction.initialEndBinding,
            repositionLabel: true,
          }),
        );
      } else if (interaction.mode === 'draw-connector') {
        if (interaction.fromQuickConnect) {
          const created = store.elements.find((el) => el.id === interaction.id);
          if (
            created &&
            !created.endBinding &&
            Math.hypot(created.width, created.height) < 10 / store.camera.zoom
          ) {
            // Simple click on the quick-connect arrow -> undo 0px temp line & open compact shape picker popover
            store.undo();
            if (interaction.sourceElementId && interaction.quickConnectHandle) {
              setQuickConnectClickMenu({
                elementId: interaction.sourceElementId,
                side: interaction.quickConnectHandle.side,
                handle: interaction.quickConnectHandle,
              });
            }
            setCursorStyle('default');
            return;
          }
        }
        store.setElementsLive((els) =>
          rerouteSingleConnector(els, interaction.id, {
            pinnedEnd: 'both',
            allowFlipOpposite: false,
            repositionLabel: true,
          }),
        );
        setCursorStyle('default');
        store.setActiveTool('select');
      }
      store.scheduleAutosave();
    }
  }

  /** @param {import('react').MouseEvent<HTMLCanvasElement>} e */
  function handleContextMenu(e) {
    const store = useBoardStore.getState();
    const screen = getScreenPoint(e);
    const world = screenToWorld(screen.x, screen.y, store.camera);
    const map = new Map(store.elements.map((el) => [el.id, el]));
    const hit = findTopmostElementAtPoint(world, store.elements, map, 10 / store.camera.zoom);

    if (!hit || hit.type === 'connector' || hit.type === 'freehand' || hit.locked) {
      setContextMenu(null);
      return;
    }

    e.preventDefault();
    let targetIds = store.selectedIds;
    if (!targetIds.includes(hit.id)) {
      targetIds = [hit.id];
      store.setSelectedIds(targetIds);
    }

    const swappableCount = targetIds.filter((id) => {
      const el = map.get(id);
      return el && el.type !== 'connector' && el.type !== 'freehand' && !el.locked;
    }).length;

    if (swappableCount === 0) {
      setContextMenu(null);
      return;
    }

    setContextMenu({
      x: screen.x,
      y: screen.y,
      currentType: hit.type,
      selectedCount: swappableCount,
    });
  }

  /** @param {import('react').MouseEvent<HTMLCanvasElement>} e */
  function handleDoubleClick(e) {
    const store = useBoardStore.getState();
    const screen = getScreenPoint(e);
    const world = screenToWorld(screen.x, screen.y, store.camera);
    const map = new Map(store.elements.map((el) => [el.id, el]));

    // Double-clicking a connector waypoint handle deletes that corner
    if (store.selectedIds.length === 1) {
      const sel = map.get(store.selectedIds[0]);
      if (sel && sel.type === 'connector' && !sel.locked && sel.waypoints && sel.waypoints.length > 0) {
        const hitRadius = 10 / store.camera.zoom;
        const idx = sel.waypoints.findIndex(
          (pt) => Math.hypot(world.x - pt.x, world.y - pt.y) <= hitRadius,
        );
        if (idx >= 0) {
          const remaining = sel.waypoints.filter((_, i) => i !== idx);
          store.updateElementById(sel.id, {
            waypoints: remaining.length > 0 ? remaining : undefined,
          });
          return;
        }
      }
    }

    const hit = findTopmostElementAtPoint(world, store.elements, map, 10 / store.camera.zoom);
    if (hit && hit.type !== 'freehand' && !hit.locked) {
      store.setSelectedIds([hit.id]);
      store.setEditingId(hit.id);
    }
  }

  /** @param {import('react').DragEvent<HTMLCanvasElement>} e */
  function handleDrop(e) {
    e.preventDefault();
    const connectorPresetId = e.dataTransfer.getData('application/x-flowboard-connector');
    const shapeType = e.dataTransfer.getData('application/x-flowboard-shape');
    if (!connectorPresetId && !shapeType) return;
    const store = useBoardStore.getState();
    const screen = getScreenPoint(e);
    const world = screenToWorld(screen.x, screen.y, store.camera);
    const sx = snapValue(world.x, GRID_SIZE, store.settings.snapToGrid);
    const sy = snapValue(world.y, GRID_SIZE, store.settings.snapToGrid);
    const el = connectorPresetId
      ? createConnectorFromPreset(connectorPresetId, sx, sy, {
          renderMode: store.settings.renderMode,
          strokeColor: store.defaultStrokeColor,
        })
      : createElementFromShape(shapeType, sx, sy, {
          renderMode: store.settings.renderMode,
        });
    store.addElement(el);
    store.setActiveTool('select');
  }

  /**
   * Spawn a new shape beside `sourceElementId` in the direction of the quick-connect arrow
   * and connect them with a bound connector in a single undoable step.
   * @param {string} sourceElementId
   * @param {ReturnType<typeof getQuickConnectHandles>[number]} handle
   * @param {string} targetType
   */
  function spawnQuickConnectedShape(sourceElementId, handle, targetType) {
    const store = useBoardStore.getState();
    const sourceEl = store.elements.find((el) => el.id === sourceElementId);
    if (!sourceEl || sourceEl.locked) return;

    // Recompute handle fresh in case the source moved/zoomed
    const freshHandle =
      getQuickConnectHandles(sourceEl, store.camera.zoom).find(
        (h) => h.side === handle.side && h.localSide === handle.localSide,
      ) || handle;

    const newEl = createElementFromShape(targetType, 0, 0, {
      renderMode: store.settings.renderMode,
    });
    const gap = 72;
    const anchor = freshHandle.anchor;

    /** @type {Record<import('../types/schema.js').PortSide, { side: import('../types/schema.js').PortSide, rx: number, ry: number }>} */
    const OPPOSITE_PORT = {
      top: { side: 'bottom', rx: 0.5, ry: 1 },
      right: { side: 'left', rx: 0, ry: 0.5 },
      bottom: { side: 'top', rx: 0.5, ry: 0 },
      left: { side: 'right', rx: 1, ry: 0.5 },
    };
    const opp = OPPOSITE_PORT[freshHandle.side];

    let rawX = anchor.x + gap;
    let rawY = anchor.y - newEl.height / 2;
    if (freshHandle.side === 'left') {
      rawX = anchor.x - gap - newEl.width;
      rawY = anchor.y - newEl.height / 2;
    } else if (freshHandle.side === 'bottom') {
      rawX = anchor.x - newEl.width / 2;
      rawY = anchor.y + gap;
    } else if (freshHandle.side === 'top') {
      rawX = anchor.x - newEl.width / 2;
      rawY = anchor.y - gap - newEl.height;
    }

    newEl.x = snapValue(rawX, GRID_SIZE, store.settings.snapToGrid);
    newEl.y = snapValue(rawY, GRID_SIZE, store.settings.snapToGrid);

    const endAnchor = {
      x: newEl.x + newEl.width * opp.rx,
      y: newEl.y + newEl.height * opp.ry,
    };

    /** @type {import('../types/schema.js').BoardElement} */
    const conn = {
      id: crypto.randomUUID(),
      type: 'connector',
      x: anchor.x,
      y: anchor.y,
      width: endAnchor.x - anchor.x,
      height: endAnchor.y - anchor.y,
      strokeColor: store.defaultStrokeColor,
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: store.settings.renderMode === 'sketch' ? 1.3 : 0,
      opacity: 1,
      seed: Math.floor(Math.random() * 100000),
      text: '',
      routing: store.defaultRouting,
      startMarker: 'none',
      endMarker: store.defaultEndMarker,
      startBinding: {
        elementId: sourceEl.id,
        side: freshHandle.side,
        rx: freshHandle.rx,
        ry: freshHandle.ry,
      },
      endBinding: {
        elementId: newEl.id,
        side: opp.side,
        rx: opp.rx,
        ry: opp.ry,
      },
    };

    store.commitSnapshot();
    store.setElementsLive((els) =>
      rerouteSingleConnector([...els, newEl, conn], conn.id, {
        pinnedEnd: 'both',
        allowFlipOpposite: false,
      }),
    );
    store.setSelectedIds([newEl.id]);
    store.scheduleAutosave();

    quickConnectMenuHoverRef.current = false;
    setQuickConnectClickMenu(null);
    setHoveredQuickConnect(null);
    setHoveredShapeId(null);
  }

  // Active Draw.io-style quick-connect menu (click popover takes priority over hover strip)
  const activeQcMenu =
    activeTool === 'select' && !editingId && !draggingLabelId && !marquee && !contextMenu
      ? quickConnectClickMenu
        ? { mode: /** @type {const} */ ('click'), ...quickConnectClickMenu }
        : hoveredQuickConnect
          ? { mode: /** @type {const} */ ('hover'), ...hoveredQuickConnect }
          : null
      : null;

  let activeQcAnchorScreen = null;
  if (activeQcMenu) {
    const srcEl = elements.find((item) => item.id === activeQcMenu.elementId);
    if (srcEl && !srcEl.locked) {
      const liveHandle =
        getQuickConnectHandles(srcEl, camera.zoom).find(
          (h) => h.side === activeQcMenu.side && h.localSide === activeQcMenu.handle.localSide,
        ) || activeQcMenu.handle;
      activeQcAnchorScreen = worldToScreen(liveHandle.x, liveHandle.y, camera);
    }
  }

  // Inline text editing overlay geometry
  const editingEl = editingId ? elements.find((e) => e.id === editingId) : null;
  let editorStyle = null;
  if (editingEl) {
    const map = new Map(elements.map((e) => [e.id, e]));
    if (editingEl.type === 'connector') {
      const routed = computeConnectorPath(editingEl, map);
      const pos = worldToScreen(routed.labelPosition.x, routed.labelPosition.y, camera);
      editorStyle = {
        left: pos.x - 80,
        top: pos.y - 18,
        width: 160,
        height: 36,
      };
    } else {
      const b = getNormalizedRect(editingEl);
      const topLeft = worldToScreen(b.x, b.y, camera);
      editorStyle = {
        left: topLeft.x,
        top: topLeft.y,
        width: Math.max(120, b.width * camera.zoom),
        height: Math.max(40, Math.min(b.height * camera.zoom, 140)),
      };
    }
  }

  const resolvedCursor =
    activeTool === 'eraser' && cursorStyle !== 'grab' && cursorStyle !== 'grabbing'
      ? ERASER_CURSOR
      : cursorStyle;

  return (
    <div className="relative flex-1 h-full overflow-hidden bg-[#F8FAFC]">
      <canvas
        ref={canvasRef}
        aria-label="Kanvas papan tulis FlowBoard"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          if (hoveredLabelId) setHoveredLabelId(null);
          if (quickConnectLeaveTimerRef.current) {
            clearTimeout(quickConnectLeaveTimerRef.current);
          }
          quickConnectLeaveTimerRef.current = setTimeout(() => {
            if (!quickConnectMenuHoverRef.current) {
              setHoveredShapeId(null);
              setHoveredQuickConnect(null);
            }
          }, 120);
        }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={handleDrop}
        style={{ cursor: resolvedCursor, touchAction: 'none' }}
        className="block w-full h-full"
      />

      {activeQcMenu && activeQcAnchorScreen && (
        <QuickConnectMenu
          mode={activeQcMenu.mode}
          side={activeQcMenu.side}
          anchorScreen={activeQcAnchorScreen}
          containerWidth={canvasRef.current?.clientWidth || 800}
          containerHeight={canvasRef.current?.clientHeight || 600}
          theme={theme}
          onSelectShape={(targetType) =>
            spawnQuickConnectedShape(activeQcMenu.elementId, activeQcMenu.handle, targetType)
          }
          onMouseEnter={() => {
            quickConnectMenuHoverRef.current = true;
            if (quickConnectLeaveTimerRef.current) {
              clearTimeout(quickConnectLeaveTimerRef.current);
              quickConnectLeaveTimerRef.current = null;
            }
          }}
          onMouseLeave={() => {
            quickConnectMenuHoverRef.current = false;
            if (activeQcMenu.mode === 'hover') {
              setHoveredQuickConnect(null);
              setHoveredShapeId(null);
            }
          }}
          onClose={() => {
            quickConnectMenuHoverRef.current = false;
            setQuickConnectClickMenu(null);
            setHoveredQuickConnect(null);
          }}
        />
      )}

      {contextMenu && (
        <ShapeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          containerWidth={canvasRef.current?.clientWidth || 800}
          containerHeight={canvasRef.current?.clientHeight || 600}
          currentType={contextMenu.currentType}
          selectedCount={contextMenu.selectedCount}
          sameTypeCount={
            elements.filter((el) => el.type === contextMenu.currentType && !el.locked).length
          }
          syncSameType={settings.syncSameType !== false}
          onToggleSyncSameType={() =>
            useBoardStore
              .getState()
              .updateSettings({ syncSameType: settings.syncSameType === false })
          }
          onSelectShape={(targetType) => {
            useBoardStore
              .getState()
              .updateSelectedElements((el) => morphElementShape(el, targetType), {
                syncSameType: true,
              });
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {editingEl && editorStyle && (
        <textarea
          autoFocus
          aria-label="Edit teks elemen"
          value={editingEl.text || ''}
          onChange={(e) =>
            useBoardStore.getState().updateElementById(editingEl.id, { text: e.target.value })
          }
          onBlur={() => useBoardStore.getState().setEditingId(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
              e.preventDefault();
              useBoardStore.getState().setEditingId(null);
            }
          }}
          style={{
            left: `${editorStyle.left}px`,
            top: `${editorStyle.top}px`,
            width: `${editorStyle.width}px`,
            height: `${editorStyle.height}px`,
            transform: editingEl.rotation ? `rotate(${editingEl.rotation}deg)` : undefined,
          }}
          className="absolute z-30 rounded-md border-2 border-[#1D4ED8] bg-[#FFFFFF]/95 px-2 py-1 text-center text-sm font-medium text-[#0F172A] shadow-sm focus:outline-none resize-none"
        />
      )}
    </div>
  );
}
