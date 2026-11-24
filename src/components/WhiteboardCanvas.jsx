import { useEffect, useRef, useState } from 'react';
import { GRID_SIZE } from '../constants/tokens.js';
import { screenToWorld, snapValue, worldToScreen, zoomAtPoint } from '../engine/camera.js';
import { renderCanvasScene } from '../engine/canvasRenderer.js';
import {
  applyResizeRotated,
  computeAlignmentGuides,
  findTopmostElementAtPoint,
  getElementBounds,
  getResizeHandles,
  hitTestResizeHandle,
  hitTestRotationHandle,
  rectsIntersect,
} from '../engine/geometry.js';
import {
  findNearestPort,
  getNormalizedRect,
  isConnectableElement,
  normalizeRotation,
} from '../engine/ports.js';
import { computeConnectorPath } from '../engine/router.js';
import { recognizeFreehandShape } from '../engine/shapeRecognizer.js';
import { createElementFromShape } from '../engine/shapeRegistry.js';
import { useBoardStore } from '../store/useBoardStore.js';

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
  const [cursorStyle, setCursorStyle] = useState('default');

  const elements = useBoardStore((s) => s.elements);
  const camera = useBoardStore((s) => s.camera);
  const settings = useBoardStore((s) => s.settings);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const editingId = useBoardStore((s) => s.editingId);

  // Render canvas whenever state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderCanvasScene(canvas, {
      elements,
      camera,
      settings,
      selectedIds,
      hoveredPort,
      showPortsForId,
      guides,
      marquee,
    });
  }, [elements, camera, settings, selectedIds, hoveredPort, showPortsForId, guides, marquee]);

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
        store.updateSelectedElements(
          (el) =>
            el.locked
              ? null
              : {
                  x: el.x + dx,
                  y: el.y + dy,
                  waypoints: el.waypoints
                    ? el.waypoints.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
                    : el.waypoints,
                },
          { skipHistory: e.repeat },
        );
        return;
      }

      if (!mod && !e.altKey) {
        const mapped = TOOL_SHORTCUTS[e.key.toLowerCase()];
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

  /** @param {import('react').PointerEvent<HTMLCanvasElement>} e */
  function handlePointerDown(e) {
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

    // Select mode: check selected connector endpoints or resize handles first
    if (store.selectedIds.length === 1) {
      const sel = elementsById.get(store.selectedIds[0]);
      if (sel && !sel.locked) {
        if (sel.type === 'connector') {
          const routed = computeConnectorPath(sel, elementsById);
          const start = routed.points[0];
          const end = routed.points[routed.points.length - 1];
          const r = 10 / store.camera.zoom;
          if (Math.hypot(world.x - start.x, world.y - start.y) <= r) {
            store.commitSnapshot();
            interactionRef.current = { mode: 'drag-connector-end', id: sel.id, which: 'start' };
            return;
          }
          if (Math.hypot(world.x - end.x, world.y - end.y) <= r) {
            store.commitSnapshot();
            interactionRef.current = { mode: 'drag-connector-end', id: sel.id, which: 'end' };
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

          // Hit-test segment midpoint handles to insert a new flexible corner
          for (const mh of routed.midpointHandles) {
            if (Math.hypot(world.x - mh.x, world.y - mh.y) <= r) {
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
        } else if (sel.type !== 'freehand') {
          const rect = getNormalizedRect(sel);
          const rot = sel.rotation || 0;
          if (hitTestRotationHandle(world, rect, store.camera.zoom, rot)) {
            store.commitSnapshot();
            interactionRef.current = {
              mode: 'rotate',
              id: sel.id,
              center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
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

    // Hit test elements
    const hit = findTopmostElementAtPoint(world, store.elements, elementsById, 8 / store.camera.zoom);
    if (hit) {
      let nextSelected = store.selectedIds;
      if (e.shiftKey) {
        nextSelected = store.selectedIds.includes(hit.id)
          ? store.selectedIds.filter((id) => id !== hit.id)
          : [...store.selectedIds, hit.id];
      } else if (!store.selectedIds.includes(hit.id)) {
        nextSelected = [hit.id];
      }
      store.setSelectedIds(nextSelected);

      const movable = nextSelected
        .map((id) => elementsById.get(id))
        .filter((el) => el && !el.locked);
      if (movable.length > 0) {
        store.commitSnapshot();
        interactionRef.current = {
          mode: 'move',
          startWorld: world,
          initialPositions: new Map(
            movable.map((el) => [
              el.id,
              {
                x: el.x,
                y: el.y,
                waypoints: el.waypoints ? el.waypoints.map((p) => ({ ...p })) : undefined,
              },
            ]),
          ),
          moved: false,
        };
      }
      return;
    }

    // Clicked empty canvas -> marquee box selection
    if (!e.shiftKey) {
      store.setSelectedIds([]);
    }
    interactionRef.current = { mode: 'marquee', startWorld: world };
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
          setCursorStyle('grab');
        } else if (store.activeTool === 'select') {
          let nextCursor = 'default';
          if (store.selectedIds.length === 1) {
            const sel = store.elements.find((el) => el.id === store.selectedIds[0]);
            if (sel && !sel.locked && sel.type !== 'connector' && sel.type !== 'freehand') {
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
          setCursorStyle(nextCursor);
        } else {
          setCursorStyle('crosshair');
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
      const port = findNearestPort(
        world,
        store.elements,
        new Set([interaction.id]),
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
      store.setElementsLive((els) =>
        els.map((el) =>
          el.id === interaction.id
            ? {
                ...el,
                width: endPt.x - el.x,
                height: endPt.y - el.y,
                endBinding: port
                  ? { elementId: port.elementId, side: port.side, rx: port.rx, ry: port.ry }
                  : null,
              }
            : el,
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
      store.setElementsLive((els) =>
        els.map((el) => {
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
              labelPos: null,
            };
          }
          return {
            ...el,
            width: targetPt.x - el.x,
            height: targetPt.y - el.y,
            endBinding: nextBinding,
            labelPos: null,
          };
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
      const rawDeg = (Math.atan2(world.y - center.y, world.x - center.x) * 180) / Math.PI + 90;
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
      store.setElementsLive((els) =>
        els.map((el) => (el.id === interaction.id ? { ...el, rotation: nextDeg } : el)),
      );
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
      store.setElementsLive((els) =>
        els.map((el) => (el.id === interaction.id ? { ...el, ...snapped } : el)),
      );
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
      if (interaction.initialPositions.size === 1) {
        const [[movedId, initPos]] = Array.from(interaction.initialPositions.entries());
        const movedEl = store.elements.find((el) => el.id === movedId);
        if (movedEl && isConnectableElement(movedEl)) {
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

      store.setElementsLive((els) =>
        els.map((el) => {
          const init = interaction.initialPositions.get(el.id);
          if (!init) return el;
          const shiftedWaypoints = init.waypoints
            ? init.waypoints.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
            : el.waypoints;
          return { ...el, x: init.x + dx, y: init.y + dy, waypoints: shiftedWaypoints };
        }),
      );
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
      store.setSelectedIds(ids);
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

    if (!interaction) return;

    if (interaction.mode === 'pan' || interaction.mode === 'rotate') {
      setCursorStyle(store.activeTool === 'hand' ? 'grab' : 'default');
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
      interaction.mode === 'resize' ||
      (interaction.mode === 'move' && interaction.moved)
    ) {
      if (interaction.mode === 'draw-connector') {
        store.setActiveTool('select');
      }
      store.scheduleAutosave();
    }
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
    const shapeType = e.dataTransfer.getData('application/x-flowboard-shape');
    if (!shapeType) return;
    const store = useBoardStore.getState();
    const screen = getScreenPoint(e);
    const world = screenToWorld(screen.x, screen.y, store.camera);
    const sx = snapValue(world.x, GRID_SIZE, store.settings.snapToGrid);
    const sy = snapValue(world.y, GRID_SIZE, store.settings.snapToGrid);
    const el = createElementFromShape(shapeType, sx, sy, {
      renderMode: store.settings.renderMode,
    });
    store.addElement(el);
    store.setActiveTool('select');
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

  return (
    <div className="relative flex-1 h-full overflow-hidden bg-[#F8FAFC]">
      <canvas
        ref={canvasRef}
        aria-label="Kanvas papan tulis FlowBoard"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={handleDrop}
        style={{ cursor: cursorStyle, touchAction: 'none' }}
        className="block w-full h-full"
      />

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
