import { flushSync } from 'react-dom';
import { create } from 'zustand';
import { clampZoom } from '../engine/camera.js';
import { computeSceneBounds } from '../engine/exporter.js';
import { layoutDiagramElements } from '../engine/autoLayout.js';
import { apiClient } from './apiClient.js';

/**
 * Compute camera transform that fits all elements cleanly inside the visible viewport.
 * @param {import('../types/schema.js').BoardElement[]} elements
 */
function computeFitCamera(elements) {
  if (elements.length === 0) return { x: 0, y: 0, zoom: 1 };
  const bounds = computeSceneBounds(elements);
  const viewW =
    typeof window !== 'undefined' ? Math.max(420, window.innerWidth - 540) : 960;
  const viewH =
    typeof window !== 'undefined' ? Math.max(320, window.innerHeight - 110) : 640;
  const zoom = clampZoom(Math.min(viewW / bounds.width, viewH / bounds.height, 1));
  return {
    zoom,
    x: Math.round(viewW / 2 - (bounds.x + bounds.width / 2) * zoom),
    y: Math.round(viewH / 2 - (bounds.y + bounds.height / 2) * zoom),
  };
}

const MAX_HISTORY = 60;
const THEME_STORAGE_KEY = 'flowboard-theme';

/**
 * Read persisted UI theme safely from localStorage.
 * @returns {'light' | 'dark'}
 */
function loadInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Resolve the exact center of the clicked theme button (falling back to pointer coordinates or viewport center).
 * @param {{ clientX?: number, clientY?: number, currentTarget?: EventTarget | null, target?: EventTarget | null } | null} [source]
 * @returns {{ x: number, y: number }}
 */
function resolveThemeOrigin(source) {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  const el = /** @type {Element | null} */ (source?.currentTarget || source?.target || null);
  if (el && typeof el.getBoundingClientRect === 'function') {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
  }
  if (source && typeof source.clientX === 'number' && typeof source.clientY === 'number') {
    if (source.clientX !== 0 || source.clientY !== 0) {
      return { x: source.clientX, y: source.clientY };
    }
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

/**
 * Persist UI theme and synchronize root dark class.
 * @param {'light' | 'dark'} theme
 */
function applyDocumentTheme(theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }
}

/** @type {import('../types/schema.js').BoardSettings} */
const DEFAULT_SETTINGS = {
  renderMode: 'clean',
  gridMode: 'dots',
  snapToGrid: true,
  autoCorrectShapes: true,
};

/** @type {ReturnType<typeof setTimeout> | null} */
let autosaveTimer = null;

/**
 * Push current elements snapshot into undo history and clear redo stack.
 * @param {import('../types/schema.js').BoardElement[][]} past
 * @param {import('../types/schema.js').BoardElement[]} current
 */
function appendHistory(past, current) {
  const next = [...past, structuredClone(current)];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

export const useBoardStore = create((set, get) => ({
  // Auth state
  /** @type {{ id: string, name: string, email: string } | null} */
  user: null,
  /** @type {'loading' | 'authenticated' | 'unauthenticated'} */
  authStatus: 'loading',
  authError: '',

  // Boards workspace state
  /** @type {Array<{ id: string, title: string, createdAt: string, updatedAt: string }>} */
  boards: [],
  /** @type {string | null} */
  activeBoardId: null,
  boardTitle: 'Papan Kerja Pertama',
  /** @type {'idle' | 'loading' | 'error'} */
  boardLoadState: 'idle',
  boardLoadError: '',
  /** @type {'saved' | 'saving' | 'dirty' | 'error'} */
  saveStatus: 'saved',
  /** @type {{ type: 'success' | 'error' | 'info', message: string } | null} */
  feedback: null,

  // Canvas & Diagram state
  /** @type {import('../types/schema.js').BoardElement[]} */
  elements: [],
  settings: { ...DEFAULT_SETTINGS },
  camera: { x: 0, y: 0, zoom: 1 },
  activeTool: 'select',
  /** @type {string[]} */
  selectedIds: [],
  /** @type {string | null} */
  editingId: null,
  /** @type {import('../types/schema.js').BoardElement[][]} */
  past: [],
  /** @type {import('../types/schema.js').BoardElement[][]} */
  future: [],
  /** @type {import('../types/schema.js').BoardElement[]} */
  clipboard: [],
  /** @type {{ width: number, height: number } | null} */
  copiedSize: null,

  // UI Theme
  /** @type {'light' | 'dark'} */
  theme: loadInitialTheme(),

  // Drawing defaults for new connectors / pens
  defaultStrokeColor: '#0F172A',
  defaultFillColor: '#FFFFFF',
  defaultRouting: /** @type {import('../types/schema.js').RoutingMode} */ ('elbow'),
  defaultEndMarker: /** @type {import('../types/schema.js').MarkerType} */ ('filled_arrow'),

  setTheme: (theme) => {
    const next = theme === 'dark' ? 'dark' : 'light';
    applyDocumentTheme(next);
    set({ theme: next });
  },
  /**
   * Toggle light/dark theme with a circular reveal expanding from the clicked coordinates.
   * @param {{ clientX?: number, clientY?: number, currentTarget?: EventTarget | null, target?: EventTarget | null }} [sourceEvent]
   */
  toggleTheme: (sourceEvent) => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    const commitTheme = () => {
      applyDocumentTheme(next);
      set({ theme: next });
    };

    if (typeof document === 'undefined' || typeof window === 'undefined') {
      commitTheme();
      return;
    }

    const docWithTransition =
      /** @type {Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }} */ (
        document
      );
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (typeof docWithTransition.startViewTransition !== 'function' || reducedMotion) {
      commitTheme();
      return;
    }

    const { x, y } = resolveThemeOrigin(sourceEvent);
    const maxRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = docWithTransition.startViewTransition(() => {
      flushSync(() => {
        commitTheme();
      });
    });

    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${maxRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 850,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      .catch(() => {
        // Ignore aborted view transitions if user toggles rapidly
      });
  },
  setFeedback: (feedback) => set({ feedback }),
  clearFeedback: () => set({ feedback: null }),
  setActiveTool: (tool) => set({ activeTool: tool, editingId: null }),
  setSelectedIds: (ids) => set({ selectedIds: ids }),
  setEditingId: (id) => set({ editingId: id }),
  setCamera: (camera) => set({ camera }),
  setDefaultStyle: (patch) => set(patch),
  setCopiedSize: (copiedSize) => set({ copiedSize }),

  scheduleAutosave: () => {
    set({ saveStatus: 'dirty' });
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      get().saveActiveBoard();
    }, 900);
  },

  bootstrapAuth: async () => {
    set({ authStatus: 'loading', authError: '' });
    try {
      const { user } = await apiClient.getMe();
      set({ user, authStatus: 'authenticated' });
      await get().loadBoards();
    } catch {
      set({ user: null, authStatus: 'unauthenticated' });
    }
  },

  login: async (email, password) => {
    set({ authError: '' });
    const { user } = await apiClient.login({ email, password });
    set({ user, authStatus: 'authenticated', authError: '' });
    await get().loadBoards();
  },

  register: async (name, email, password) => {
    set({ authError: '' });
    const { user } = await apiClient.register({ name, email, password });
    set({ user, authStatus: 'authenticated', authError: '' });
    await get().loadBoards();
  },

  logout: async () => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    try {
      await apiClient.logout();
    } catch {
      // Clear local session state even if network request fails
    }
    set({
      user: null,
      authStatus: 'unauthenticated',
      boards: [],
      activeBoardId: null,
      elements: [],
      selectedIds: [],
      past: [],
      future: [],
      copiedSize: null,
      feedback: null,
    });
  },

  loadBoards: async () => {
    set({ boardLoadState: 'loading', boardLoadError: '' });
    try {
      const { boards } = await apiClient.listBoards();
      if (boards.length === 0) {
        const created = await apiClient.createBoard({ title: 'Papan Kerja Pertama' });
        set({
          boards: [
            {
              id: created.board.id,
              title: created.board.title,
              createdAt: created.board.createdAt,
              updatedAt: created.board.updatedAt,
            },
          ],
          activeBoardId: created.board.id,
          boardTitle: created.board.title,
          elements: created.board.elements || [],
          settings: created.board.settings || { ...DEFAULT_SETTINGS },
          boardLoadState: 'idle',
          saveStatus: 'saved',
          past: [],
          future: [],
          selectedIds: [],
        });
        return;
      }

      set({ boards });
      await get().selectBoard(boards[0].id);
    } catch (err) {
      set({
        boardLoadState: 'error',
        boardLoadError: err?.message || 'Gagal memuat daftar papan kerja.',
      });
    }
  },

  selectBoard: async (boardId) => {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    set({ boardLoadState: 'loading', boardLoadError: '' });
    try {
      const { board } = await apiClient.getBoard(boardId);
      set({
        activeBoardId: board.id,
        boardTitle: board.title,
        elements: board.elements || [],
        settings: board.settings || { ...DEFAULT_SETTINGS },
        boardLoadState: 'idle',
        saveStatus: 'saved',
        selectedIds: [],
        editingId: null,
        past: [],
        future: [],
        camera: { x: 0, y: 0, zoom: 1 },
      });
    } catch (err) {
      set({
        boardLoadState: 'error',
        boardLoadError: err?.message || 'Gagal membuka papan kerja.',
      });
    }
  },

  /**
   * Switch to the next (+1) or previous (-1) board in the workspace list.
   * @param {1 | -1} [direction]
   */
  cycleBoard: async (direction = 1) => {
    const { boards, activeBoardId, boardLoadState, saveStatus } = get();
    if (boards.length <= 1 || boardLoadState === 'loading') return;
    const currentIdx = boards.findIndex((b) => b.id === activeBoardId);
    const step = direction < 0 ? -1 : 1;
    const nextIdx = currentIdx < 0 ? 0 : (currentIdx + step + boards.length) % boards.length;
    const nextBoard = boards[nextIdx];
    if (!nextBoard || nextBoard.id === activeBoardId) return;
    if (saveStatus === 'dirty') {
      await get().saveActiveBoard();
    }
    await get().selectBoard(nextBoard.id);
  },

  createNewBoard: async (title) => {
    const { saveStatus, boards } = get();
    if (saveStatus === 'dirty') {
      await get().saveActiveBoard();
    }
    const cleanTitle = (title || '').trim() || `Papan Baru ${boards.length + 1}`;
    try {
      const { board } = await apiClient.createBoard({
        title: cleanTitle,
        settings: { ...DEFAULT_SETTINGS },
        elements: [],
      });
      set((state) => ({
        boards: [
          {
            id: board.id,
            title: board.title,
            createdAt: board.createdAt,
            updatedAt: board.updatedAt,
          },
          ...state.boards,
        ],
        activeBoardId: board.id,
        boardTitle: board.title,
        elements: [],
        settings: board.settings,
        selectedIds: [],
        editingId: null,
        past: [],
        future: [],
        saveStatus: 'saved',
        camera: { x: 0, y: 0, zoom: 1 },
        feedback: { type: 'success', message: `Papan "${board.title}" berhasil dibuat.` },
      }));
    } catch (err) {
      set({
        feedback: { type: 'error', message: err?.message || 'Gagal membuat papan kerja baru.' },
      });
    }
  },

  deleteBoardById: async (boardId) => {
    const { activeBoardId, boards } = get();
    if (!boardId) return;
    if (boards.length <= 1) {
      set({
        feedback: {
          type: 'info',
          message: 'Minimal harus tersedia satu papan kerja aktif.',
        },
      });
      return;
    }

    const target = boards.find((b) => b.id === boardId);
    try {
      await apiClient.deleteBoard(boardId);
      const remaining = boards.filter((b) => b.id !== boardId);
      set({
        boards: remaining,
        feedback: {
          type: 'success',
          message: target ? `Papan "${target.title}" berhasil dihapus.` : 'Papan kerja berhasil dihapus.',
        },
      });
      if (boardId === activeBoardId && remaining.length > 0) {
        await get().selectBoard(remaining[0].id);
      }
    } catch (err) {
      set({
        feedback: { type: 'error', message: err?.message || 'Gagal menghapus papan kerja.' },
      });
    }
  },

  deleteActiveBoard: async () => {
    await get().deleteBoardById(get().activeBoardId);
  },

  renameBoard: (title) => {
    const clean = title.slice(0, 120);
    set((state) => ({
      boardTitle: clean,
      boards: state.boards.map((b) =>
        b.id === state.activeBoardId ? { ...b, title: clean || b.title } : b,
      ),
    }));
    get().scheduleAutosave();
  },

  saveActiveBoard: async () => {
    const { activeBoardId, boardTitle, settings, elements, user } = get();
    if (!activeBoardId || !user) return;
    set({ saveStatus: 'saving' });
    try {
      const { board } = await apiClient.updateBoard(activeBoardId, {
        title: boardTitle.trim() || 'Tanpa Judul',
        settings,
        elements,
      });
      set((state) => ({
        saveStatus: 'saved',
        boards: state.boards.map((b) =>
          b.id === board.id ? { ...b, title: board.title, updatedAt: board.updatedAt } : b,
        ),
      }));
    } catch (err) {
      set({
        saveStatus: 'error',
        feedback: {
          type: 'error',
          message: err?.message || 'Gagal menyimpan perubahan ke server.',
        },
      });
    }
  },

  // Element mutations (with Undo/Redo history)
  commitSnapshot: () => {
    set((state) => ({
      past: appendHistory(state.past, state.elements),
      future: [],
    }));
  },

  addElement: (element, options = {}) => {
    set((state) => ({
      past: options.skipHistory ? state.past : appendHistory(state.past, state.elements),
      future: options.skipHistory ? state.future : [],
      elements: [...state.elements, element],
      selectedIds: options.select === false ? state.selectedIds : [element.id],
    }));
    get().scheduleAutosave();
  },

  setElementsLive: (updater) => {
    set((state) => ({
      elements: typeof updater === 'function' ? updater(state.elements) : updater,
    }));
  },

  updateSelectedElements: (patchOrUpdater, options = {}) => {
    const selectedSet = new Set(get().selectedIds);
    if (selectedSet.size === 0) return;
    set((state) => ({
      past: options.skipHistory ? state.past : appendHistory(state.past, state.elements),
      future: options.skipHistory ? state.future : [],
      elements: state.elements.map((el) => {
        if (!selectedSet.has(el.id)) return el;
        if (typeof patchOrUpdater === 'function') {
          const nextPatch = patchOrUpdater(el);
          return nextPatch ? { ...el, ...nextPatch } : el;
        }
        return { ...el, ...patchOrUpdater };
      }),
    }));
    get().scheduleAutosave();
  },

  updateElementById: (id, patch, options = {}) => {
    set((state) => ({
      past: options.skipHistory ? state.past : appendHistory(state.past, state.elements),
      future: options.skipHistory ? state.future : [],
      elements: state.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    }));
    get().scheduleAutosave();
  },

  replaceElementWithHistory: (oldId, replacement) => {
    set((state) => ({
      past: appendHistory(state.past, state.elements),
      future: [],
      elements: state.elements.map((el) => (el.id === oldId ? replacement : el)),
    }));
    get().scheduleAutosave();
  },

  deleteElementsByIds: (ids) => {
    const removeSet = new Set(ids);
    if (removeSet.size === 0) return;
    set((state) => {
      const remaining = state.elements
        .filter((el) => !removeSet.has(el.id))
        .map((el) => {
          if (el.type !== 'connector') return el;
          const startBinding =
            el.startBinding && removeSet.has(el.startBinding.elementId) ? null : el.startBinding;
          const endBinding =
            el.endBinding && removeSet.has(el.endBinding.elementId) ? null : el.endBinding;
          return { ...el, startBinding, endBinding };
        });
      return {
        past: appendHistory(state.past, state.elements),
        future: [],
        elements: remaining,
        selectedIds: state.selectedIds.filter((id) => !removeSet.has(id)),
        editingId: state.editingId && removeSet.has(state.editingId) ? null : state.editingId,
      };
    });
    get().scheduleAutosave();
  },

  deleteSelected: () => {
    const { selectedIds } = get();
    get().deleteElementsByIds(selectedIds);
  },

  duplicateSelected: () => {
    const { elements, selectedIds } = get();
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    const idMap = new Map();
    const clones = elements
      .filter((el) => selectedSet.has(el.id))
      .map((el) => {
        const nextId = crypto.randomUUID();
        idMap.set(el.id, nextId);
        return {
          ...structuredClone(el),
          id: nextId,
          x: el.x + 24,
          y: el.y + 24,
          waypoints: el.waypoints ? el.waypoints.map((p) => ({ x: p.x + 24, y: p.y + 24 })) : undefined,
          seed: Math.floor(Math.random() * 1000000) + 1,
        };
      })
      .map((el) => {
        if (el.type !== 'connector') return el;
        return {
          ...el,
          startBinding: el.startBinding && idMap.has(el.startBinding.elementId)
            ? { ...el.startBinding, elementId: idMap.get(el.startBinding.elementId) }
            : null,
          endBinding: el.endBinding && idMap.has(el.endBinding.elementId)
            ? { ...el.endBinding, elementId: idMap.get(el.endBinding.elementId) }
            : null,
        };
      });

    set((state) => ({
      past: appendHistory(state.past, state.elements),
      future: [],
      elements: [...state.elements, ...clones],
      selectedIds: clones.map((c) => c.id),
    }));
    get().scheduleAutosave();
  },

  copySelected: () => {
    const { elements, selectedIds } = get();
    const setIds = new Set(selectedIds);
    const copied = elements.filter((e) => setIds.has(e.id)).map((e) => structuredClone(e));
    if (copied.length > 0) {
      set({ clipboard: copied });
    }
  },

  pasteClipboard: () => {
    const { clipboard } = get();
    if (clipboard.length === 0) return;
    const clones = clipboard.map((el) => ({
      ...structuredClone(el),
      id: crypto.randomUUID(),
      x: el.x + 32,
      y: el.y + 32,
      waypoints: el.waypoints ? el.waypoints.map((p) => ({ x: p.x + 32, y: p.y + 32 })) : undefined,
      startBinding: null,
      endBinding: null,
      seed: Math.floor(Math.random() * 1000000) + 1,
    }));
    set((state) => ({
      past: appendHistory(state.past, state.elements),
      future: [],
      elements: [...state.elements, ...clones],
      selectedIds: clones.map((c) => c.id),
    }));
    get().scheduleAutosave();
  },

  reorderSelected: (direction) => {
    const { elements, selectedIds } = get();
    if (selectedIds.length === 0) return;

    const selectedSet = new Set(selectedIds);
    let next = [...elements];

    if (direction === 'front') {
      const unselected = next.filter((e) => !selectedSet.has(e.id));
      const selected = next.filter((e) => selectedSet.has(e.id));
      next = [...unselected, ...selected];
    } else if (direction === 'back') {
      const selected = next.filter((e) => selectedSet.has(e.id));
      const unselected = next.filter((e) => !selectedSet.has(e.id));
      next = [...selected, ...unselected];
    } else if (selectedIds.length === 1) {
      const idx = next.findIndex((e) => e.id === selectedIds[0]);
      if (idx < 0) return;
      const [item] = next.splice(idx, 1);
      if (direction === 'forward') next.splice(Math.min(next.length, idx + 1), 0, item);
      else if (direction === 'backward') next.splice(Math.max(0, idx - 1), 0, item);
    }

    set((state) => ({
      past: appendHistory(state.past, state.elements),
      future: [],
      elements: next,
    }));
    get().scheduleAutosave();
  },

  undo: () => {
    const { past, elements } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set((state) => ({
      past: state.past.slice(0, -1),
      future: [structuredClone(elements), ...state.future].slice(0, MAX_HISTORY),
      elements: previous,
      selectedIds: [],
      editingId: null,
    }));
    get().scheduleAutosave();
  },

  redo: () => {
    const { future, elements } = get();
    if (future.length === 0) return;
    const next = future[0];
    set((state) => ({
      past: appendHistory(state.past, elements),
      future: state.future.slice(1),
      elements: next,
      selectedIds: [],
      editingId: null,
    }));
    get().scheduleAutosave();
  },

  updateSettings: (patch) => {
    set((state) => {
      const nextSettings = { ...state.settings, ...patch };
      let nextElements = state.elements;
      if (patch.renderMode) {
        const targetRoughness = patch.renderMode === 'sketch' ? 1.3 : 0;
        const targetFont = patch.renderMode === 'sketch' ? 'sketch' : 'sans';
        nextElements = state.elements.map((el) =>
          el.type === 'freehand'
            ? el
            : { ...el, roughness: targetRoughness, fontFamily: targetFont },
        );
      }
      return { settings: nextSettings, elements: nextElements };
    });
    get().scheduleAutosave();
  },

  applyTemplate: (templateElements, title) => {
    set((state) => {
      const nextTitle = title || state.boardTitle;
      return {
        past: appendHistory(state.past, state.elements),
        future: [],
        elements: templateElements,
        boardTitle: nextTitle,
        boards: state.boards.map((b) =>
          b.id === state.activeBoardId ? { ...b, title: nextTitle } : b,
        ),
        selectedIds: [],
        editingId: null,
        camera: { x: 0, y: 0, zoom: 1 },
        feedback: { type: 'success', message: `Template "${title}" diterapkan ke papan kerja.` },
      };
    });
    get().scheduleAutosave();
  },

  importDocument: (doc) => {
    set((state) => ({
      past: appendHistory(state.past, state.elements),
      future: [],
      boardTitle: doc.title,
      boards: state.boards.map((b) =>
        b.id === state.activeBoardId ? { ...b, title: doc.title } : b,
      ),
      settings: doc.settings,
      elements: doc.elements,
      selectedIds: [],
      editingId: null,
      camera: { x: 0, y: 0, zoom: 1 },
      feedback: { type: 'success', message: `Diagram "${doc.title}" berhasil diimpor.` },
    }));
    get().scheduleAutosave();
  },

  insertGeneratedDiagram: (generatedElements, options) => {
    set((state) => {
      const nextElements =
        options.mode === 'append'
          ? [...state.elements, ...generatedElements]
          : generatedElements;
      return {
        past: appendHistory(state.past, state.elements),
        future: [],
        elements: nextElements,
        selectedIds: generatedElements.map((e) => e.id),
        editingId: null,
        camera: options.mode === 'replace' ? computeFitCamera(nextElements) : state.camera,
        feedback: {
          type: 'success',
          message: `${options.label} berhasil digenerate dari PlantText (${generatedElements.length} elemen).`,
        },
      };
    });
    get().scheduleAutosave();
  },

  /** @param {'LR' | 'TB'} [direction] */
  autoLayoutBoard: (direction = 'LR') => {
    const { elements } = get();
    if (elements.length === 0) return;
    const arranged = layoutDiagramElements(elements, { direction });
    set((state) => ({
      past: appendHistory(state.past, state.elements),
      future: [],
      elements: arranged,
      selectedIds: [],
      editingId: null,
      camera: computeFitCamera(arranged),
      feedback: {
        type: 'success',
        message: `Tata letak dirapikan (${direction === 'LR' ? 'Kiri ke Kanan' : 'Atas ke Bawah'}).`,
      },
    }));
    get().scheduleAutosave();
  },
}));
