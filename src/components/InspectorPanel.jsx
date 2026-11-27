import { useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpToLine,
  ClipboardPaste,
  Copy,
  Crown,
  GitBranch,
  Link2,
  Loader2,
  Lock,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  RotateCw,
  Sparkles,
  Trash2,
  Unlink2,
  Unlock,
  X,
} from 'lucide-react';
import {
  CANVAS_FILL_SWATCHES,
  CANVAS_STROKE_SWATCHES,
  STROKE_WIDTH_OPTIONS,
} from '../constants/tokens.js';
import { getNormalizedRect, normalizeRotation } from '../engine/ports.js';
import { useBoardStore } from '../store/useBoardStore.js';
import { MarkerPicker, RoutingPicker } from './MarkerPicker.jsx';

const MIN_ELEMENT_SIZE = 24;
const MAX_ELEMENT_SIZE = 4000;

/**
 * Clamp manual pixel dimension to valid board bounds.
 * @param {number} value
 * @returns {number}
 */
function clampDimension(value) {
  return Math.round(Math.min(MAX_ELEMENT_SIZE, Math.max(MIN_ELEMENT_SIZE, value)));
}

/**
 * Build a normalized width/height update patch for a resizable element.
 * @param {import('../types/schema.js').BoardElement} el
 * @param {number | null} nextWidth
 * @param {number | null} nextHeight
 */
function buildSizePatch(el, nextWidth, nextHeight) {
  const rect = getNormalizedRect(el);
  /** @type {Partial<import('../types/schema.js').BoardElement>} */
  const patch = {};
  if (typeof nextWidth === 'number') {
    patch.x = rect.x;
    patch.width = clampDimension(nextWidth);
  }
  if (typeof nextHeight === 'number') {
    patch.y = rect.y;
    patch.height = clampDimension(nextHeight);
  }
  return patch;
}

const FONT_SIZE_OPTIONS = [
  { label: '12', value: 12 },
  { label: '14', value: 14 },
  { label: '18', value: 18 },
  { label: '24', value: 24 },
];

const OPACITY_OPTIONS = [
  { label: '100%', value: 1 },
  { label: '80%', value: 0.8 },
  { label: '60%', value: 0.6 },
  { label: '40%', value: 0.4 },
];

const NON_FILLABLE_TYPES = new Set(['connector', 'freehand', 'text', 'uml_actor']);

/**
 * Return the shared value across a list of elements, or `'__mixed__'` if values differ.
 * @template T
 * @param {import('../types/schema.js').BoardElement[]} list
 * @param {(el: import('../types/schema.js').BoardElement) => T} getter
 * @returns {T | '__mixed__' | undefined}
 */
function getSharedValue(list, getter) {
  if (list.length === 0) return undefined;
  const first = getter(list[0]);
  for (let i = 1; i < list.length; i += 1) {
    if (getter(list[i]) !== first) return '__mixed__';
  }
  return first;
}

/**
 * @param {{ open: boolean, onToggle: () => void }} props
 */
export function InspectorPanel({ open, onToggle }) {
  const [lockAspectRatio, setLockAspectRatio] = useState(false);
  const [strokeStyleScope, setStrokeStyleScope] = useState(
    /** @type {'selected' | 'all'} */ ('selected'),
  );
  const [focusedDim, setFocusedDim] = useState(/** @type {'width' | 'height' | null} */ (null));
  const [widthDraft, setWidthDraft] = useState('');
  const [heightDraft, setHeightDraft] = useState('');
  const dimSessionRef = useRef(
    /** @type {{ ratios: Map<string, number>, historyCommitted: boolean }} */ ({
      ratios: new Map(),
      historyCommitted: false,
    }),
  );

  const elements = useBoardStore((s) => s.elements);
  const user = useBoardStore((s) => s.user);
  const tidyingDiagram = useBoardStore((s) => s.tidyingDiagram);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const settings = useBoardStore((s) => s.settings);
  const defaultStrokeColor = useBoardStore((s) => s.defaultStrokeColor);
  const defaultFillColor = useBoardStore((s) => s.defaultFillColor);
  const defaultRouting = useBoardStore((s) => s.defaultRouting);
  const defaultEndMarker = useBoardStore((s) => s.defaultEndMarker);
  const copiedSize = useBoardStore((s) => s.copiedSize);

  const updateSelectedElements = useBoardStore((s) => s.updateSelectedElements);
  const updateElementById = useBoardStore((s) => s.updateElementById);
  const deleteSelected = useBoardStore((s) => s.deleteSelected);
  const duplicateSelected = useBoardStore((s) => s.duplicateSelected);
  const reorderSelected = useBoardStore((s) => s.reorderSelected);
  const setDefaultStyle = useBoardStore((s) => s.setDefaultStyle);
  const setCopiedSize = useBoardStore((s) => s.setCopiedSize);
  const setFeedback = useBoardStore((s) => s.setFeedback);
  const updateSettings = useBoardStore((s) => s.updateSettings);
  const autoLayoutBoard = useBoardStore((s) => s.autoLayoutBoard);
  const tidyActiveBoard = useBoardStore((s) => s.tidyActiveBoard);
  const hasAiAccess = Boolean(user?.hasAiAccess);

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Buka Pengaturan Papan (])"
        aria-label="Buka panel properti elemen (])"
        className="fixed right-3 top-14 z-20 inline-flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-2 text-xs font-medium text-[#0F172A] shadow-sm hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
      >
        <PanelRightOpen className="h-4 w-4 text-[#475569]" strokeWidth={1.75} aria-hidden="true" />
      </button>
    );
  }

  const selectedElements = elements.filter((e) => selectedIds.includes(e.id));
  const isMulti = selectedElements.length > 1;
  const primary = selectedElements.length === 1 ? selectedElements[0] : null;

  const connectorElements = selectedElements.filter((e) => e.type === 'connector');
  const fillableElements = selectedElements.filter((e) => !NON_FILLABLE_TYPES.has(e.type));
  const textElements = selectedElements.filter((e) => e.type !== 'freehand');
  const styleLineElements = selectedElements.filter((e) => e.type !== 'freehand' && e.type !== 'text');
  const renderableElements = selectedElements.filter((e) => e.type !== 'freehand');
  const rotatableElements = selectedElements.filter((e) => e.type !== 'connector' && e.type !== 'freehand');
  const resizableElements = rotatableElements;
  const elementsById = new Map(elements.map((e) => [e.id, e]));
  const orderedResizable = selectedIds
    .map((id) => elementsById.get(id))
    .filter(
      /** @returns {e is import('../types/schema.js').BoardElement} */ (e) =>
        Boolean(e && e.type !== 'connector' && e.type !== 'freehand'),
    );
  const referenceResizable = orderedResizable[0] || resizableElements[0] || null;
  const referenceRect = referenceResizable ? getNormalizedRect(referenceResizable) : null;
  const referenceWidth = referenceRect ? Math.round(referenceRect.width) : 0;
  const referenceHeight = referenceRect ? Math.round(referenceRect.height) : 0;
  const allResizableLocked =
    resizableElements.length > 0 && resizableElements.every((e) => Boolean(e.locked));

  const isConnectorOnly = primary?.type === 'connector';
  const isErdTable = primary?.type === 'erd_table' || primary?.type === 'erd_weak_table';
  const isUmlClass = primary?.type === 'uml_class' || primary?.type === 'uml_interface';
  const hasCodeField =
    primary?.type === 'dfd_gs_process' ||
    primary?.type === 'dfd_gs_datastore' ||
    primary?.type === 'dfd_yd_process' ||
    primary?.type === 'uml_fragment';

  const allLocked = selectedElements.length > 0 && selectedElements.every((e) => Boolean(e.locked));

  // Shared values for active button highlights (supports single & multi-select)
  const sharedStrokeColor = getSharedValue(selectedElements, (e) => e.strokeColor);
  const sharedFillColor = getSharedValue(fillableElements, (e) => e.fillColor);
  const sharedStrokeWidth = getSharedValue(selectedElements, (e) => e.strokeWidth);
  const sharedStrokeStyle = getSharedValue(styleLineElements, (e) => e.strokeStyle);
  const sharedRenderMode = getSharedValue(renderableElements, (e) => (e.roughness > 0 ? 'sketch' : 'clean'));
  const sharedFontFamily = getSharedValue(textElements, (e) => e.fontFamily || 'sans');
  const sharedFontSize = getSharedValue(textElements, (e) => e.fontSize || (e.type === 'connector' ? 12 : 14));
  const sharedOpacity = getSharedValue(selectedElements, (e) => e.opacity);
  const sharedRouting = getSharedValue(connectorElements, (e) => e.routing || 'elbow');
  const sharedStartMarker = getSharedValue(connectorElements, (e) => e.startMarker || 'none');
  const sharedEndMarker = getSharedValue(connectorElements, (e) => e.endMarker || 'none');
  const sharedRotation = getSharedValue(rotatableElements, (e) => normalizeRotation(e.rotation || 0));
  const sharedWidth = getSharedValue(resizableElements, (e) => Math.round(getNormalizedRect(e).width));
  const sharedHeight = getSharedValue(resizableElements, (e) => Math.round(getNormalizedRect(e).height));

  const syncSameType = settings.syncSameType !== false;
  const selectedTypes = new Set(selectedElements.map((e) => e.type));
  const sameTypeTargetCount = elements.filter(
    (e) => selectedTypes.has(e.type) && !e.locked,
  ).length;

  /**
   * Capture each selected resizable element's aspect ratio at focus start so mid-typing
   * intermediate digits (e.g. "24" while typing "240") never distort the locked ratio.
   */
  function startDimensionSession() {
    const ratios = new Map();
    const candidates = syncSameType
      ? elements.filter((el) => selectedTypes.has(el.type) && el.type !== 'connector' && el.type !== 'freehand')
      : resizableElements;
    for (const el of candidates) {
      const rect = getNormalizedRect(el);
      ratios.set(el.id, Math.max(1, rect.width) / Math.max(1, rect.height));
    }
    dimSessionRef.current = { ratios, historyCommitted: false };
  }

  /**
   * Apply manual width and/or height to all selected unlocked resizable elements.
   * @param {{ width?: number, height?: number, respectRatio?: boolean, useSession?: boolean }} next
   */
  function applyManualDimensions({ width, height, respectRatio = false, useSession = false }) {
    const skipHistory = useSession && dimSessionRef.current.historyCommitted;
    updateSelectedElements(
      (el) => {
        if (el.type === 'connector' || el.type === 'freehand' || el.locked) return null;
        const rect = getNormalizedRect(el);
        const currentRatio = Math.max(1, rect.width) / Math.max(1, rect.height);
        const ratio =
          useSession && dimSessionRef.current.ratios.has(el.id)
            ? /** @type {number} */ (dimSessionRef.current.ratios.get(el.id))
            : currentRatio;
        let nextW = typeof width === 'number' ? clampDimension(width) : null;
        let nextH = typeof height === 'number' ? clampDimension(height) : null;

        if (respectRatio && lockAspectRatio) {
          if (nextW !== null && nextH === null) {
            nextH = clampDimension(nextW / ratio);
          } else if (nextH !== null && nextW === null) {
            nextW = clampDimension(nextH * ratio);
          }
        }

        return buildSizePatch(el, nextW, nextH);
      },
      { skipHistory, syncSameType: true },
    );
    if (useSession) {
      dimSessionRef.current.historyCommitted = true;
    }
  }

  /**
   * Commit a manual dimension draft string on blur or Enter.
   * @param {'width' | 'height'} axis
   * @param {string} raw
   */
  function commitDimensionDraft(axis, raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    const clamped = clampDimension(parsed);
    if (axis === 'width') {
      applyManualDimensions({ width: clamped, respectRatio: true, useSession: true });
    } else {
      applyManualDimensions({ height: clamped, respectRatio: true, useSession: true });
    }
  }

  /** @param {string} id @param {import('../types/schema.js').ErdField[]} fields */
  function syncErdFields(id, fields) {
    const nextHeight = Math.max(96, 40 + fields.length * 24 + 8);
    updateElementById(id, { fields, height: nextHeight });
  }

  return (
    <aside
      aria-label="Panel properti elemen"
      className="w-72 shrink-0 bg-[#FFFFFF] border-l border-[#E2E8F0] flex flex-col h-full z-20 max-lg:fixed max-lg:right-0 max-lg:top-12 max-lg:bottom-0 max-lg:shadow-sm"
    >
      <div className="px-3 py-2.5 border-b border-[#E2E8F0] flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#475569]">
          {selectedElements.length === 0
            ? 'Pengaturan Papan'
            : isMulti
              ? `${selectedElements.length} Elemen Dipilih`
              : isConnectorOnly
                ? 'Properti Konektor'
                : 'Properti Elemen'}
        </h2>
        <button
          type="button"
          onClick={onToggle}
          title="Tutup Pengaturan Papan (])"
          aria-label="Tutup panel properti (])"
          className="inline-flex items-center justify-center p-1 rounded-md text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
        >
          <PanelRightClose className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
        {selectedElements.length === 0 ? (
          <>
            <section className="space-y-2">
              <h3 className="font-semibold text-[#0F172A]">Gaya Default Gambar</h3>
              <div>
                <span className="block text-[#475569] mb-1.5">Warna Garis Default</span>
                <div className="flex flex-wrap gap-1.5">
                  {CANVAS_STROKE_SWATCHES.map((sw) => (
                    <button
                      key={sw.value}
                      type="button"
                      onClick={() => setDefaultStyle({ defaultStrokeColor: sw.value })}
                      title={sw.label}
                      aria-label={sw.label}
                      className={`h-6 w-6 rounded-md border ${
                        defaultStrokeColor === sw.value
                          ? 'ring-2 ring-[#1D4ED8] ring-offset-1 border-[#0F172A]'
                          : 'border-[#E2E8F0]'
                      }`}
                      style={{ backgroundColor: sw.value }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-[#475569] mb-1.5">Warna Isi Default</span>
                <div className="flex flex-wrap gap-1.5">
                  {CANVAS_FILL_SWATCHES.map((sw) => (
                    <button
                      key={sw.value}
                      type="button"
                      onClick={() => setDefaultStyle({ defaultFillColor: sw.value })}
                      title={sw.label}
                      aria-label={sw.label}
                      className={`h-6 w-6 rounded-md border ${
                        defaultFillColor === sw.value
                          ? 'ring-2 ring-[#1D4ED8] ring-offset-1 border-[#0F172A]'
                          : 'border-[#CBD5E1]'
                      }`}
                      style={{
                        backgroundColor: sw.value === 'transparent' ? '#FFFFFF' : sw.value,
                        backgroundImage:
                          sw.value === 'transparent'
                            ? 'linear-gradient(135deg, transparent 45%, #B91C1C 45%, #B91C1C 55%, transparent 55%)'
                            : undefined,
                      }}
                    />
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-2 pt-3 border-t border-[#E2E8F0]">
              <h3 className="font-semibold text-[#0F172A]">Default Konektor</h3>
              <RoutingPicker
                id="default-routing"
                label="Tipe Jalur"
                shortcut="L"
                value={defaultRouting}
                onChange={(val) => setDefaultStyle({ defaultRouting: val })}
              />
              <MarkerPicker
                id="default-end-marker"
                label="Ujung Akhir Default"
                value={defaultEndMarker}
                direction="end"
                onChange={(val) => setDefaultStyle({ defaultEndMarker: val })}
              />
            </section>

            <section className="space-y-2 pt-3 border-t border-[#E2E8F0]">
              <h3 className="font-semibold text-[#0F172A]">Kanvas & Grid</h3>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: 'dots', label: 'Titik' },
                  { id: 'lines', label: 'Garis' },
                  { id: 'none', label: 'Polos' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateSettings({ gridMode: opt.id })}
                    className={`py-1.5 rounded-md border font-medium ${
                      settings.gridMode === opt.id
                        ? 'border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]'
                        : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center justify-between py-1 text-[#0F172A] cursor-pointer">
                <span>Snap ke Grid (20px)</span>
                <input
                  type="checkbox"
                  checked={settings.snapToGrid}
                  onChange={(e) => updateSettings({ snapToGrid: e.target.checked })}
                  className="h-4 w-4 accent-[#1D4ED8]"
                />
              </label>
              <label className="flex items-center justify-between py-1 text-[#0F172A] cursor-pointer">
                <span>Koreksi Bentuk Pena</span>
                <input
                  type="checkbox"
                  checked={settings.autoCorrectShapes !== false}
                  onChange={(e) => updateSettings({ autoCorrectShapes: e.target.checked })}
                  className="h-4 w-4 accent-[#1D4ED8]"
                />
              </label>
              <div
                title="Saat aktif, perubahan gaya, ukuran, atau bentuk otomatis diterapkan ke semua komponen sejenis di papan ini"
                className="flex items-center justify-between py-1 text-[#0F172A]"
              >
                <span>Sinkron Komponen Sejenis</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={syncSameType}
                  aria-label="Sinkron Komponen Sejenis"
                  onClick={() => updateSettings({ syncSameType: !syncSameType })}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
                    syncSameType
                      ? 'border-transparent bg-[#1D4ED8]'
                      : 'border-[#CBD5E1] bg-[#E2E8F0]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-xs transition-transform duration-200 ${
                      syncSameType ? 'translate-x-[17px]' : 'translate-x-[2px]'
                    }`}
                  />
                </button>
              </div>
              <div
                title="Saat aktif, garis konektor yang saling bersilang otomatis membentuk loncatan kerucut (/\\)"
                className="flex items-center justify-between py-1 text-[#0F172A]"
              >
                <span>Loncatan Garis Bersilang</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.lineJumps !== false}
                  aria-label="Loncatan Garis Bersilang"
                  onClick={() => updateSettings({ lineJumps: settings.lineJumps === false })}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
                    settings.lineJumps !== false
                      ? 'border-transparent bg-[#1D4ED8]'
                      : 'border-[#CBD5E1] bg-[#E2E8F0]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-xs transition-transform duration-200 ${
                      settings.lineJumps !== false ? 'translate-x-[17px]' : 'translate-x-[2px]'
                    }`}
                  />
                </button>
              </div>
              <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
                <span className="block font-semibold text-[#0F172A]">Rapikan Tata Letak</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={elements.length === 0}
                    onClick={() => autoLayoutBoard('LR')}
                    className="py-1.5 px-2 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-40 font-medium"
                  >
                    Kiri → Kanan
                  </button>
                  <button
                    type="button"
                    disabled={elements.length === 0}
                    onClick={() => autoLayoutBoard('TB')}
                    className="py-1.5 px-2 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-40 font-medium"
                  >
                    Atas → Bawah
                  </button>
                </div>

                {/* Pro 2-Mode Anti-Conflict Tidy Optimizer */}
                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-[#0F172A]">
                      Optimasi Anti-Bentrok
                    </span>
                    <span
                      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                        hasAiAccess
                          ? 'bg-[#DCFCE7] text-[#15803D]'
                          : 'bg-[#FEE2E2] text-[#B91C1C]'
                      }`}
                    >
                      <Crown className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
                      {hasAiAccess ? 'Pro' : 'Pro'}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={tidyingDiagram || (hasAiAccess && elements.length === 0)}
                    onClick={() => tidyActiveBoard('full')}
                    title={
                      hasAiAccess
                        ? 'Tata ulang komponen, port, jalur garis & label agar minim persilangan'
                        : 'Fitur FlowBoard Pro — klik untuk melihat paket Pro'
                    }
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1D4ED8] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#1E40AF] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
                  >
                    {tidyingDiagram ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    )}
                    <span>Rapikan Penuh</span>
                  </button>

                  <button
                    type="button"
                    disabled={tidyingDiagram || (hasAiAccess && elements.length === 0)}
                    onClick={() => tidyActiveBoard('connectors_only')}
                    title={
                      hasAiAccess
                        ? 'Kunci posisi komponen, luruskan konektor & pisahkan label bertumpuk'
                        : 'Fitur FlowBoard Pro — klik untuk melihat paket Pro'
                    }
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
                  >
                    <GitBranch className="h-3.5 w-3.5 text-[#15803D]" strokeWidth={1.75} aria-hidden="true" />
                    <span>Rapikan Garis &amp; Label Saja</span>
                  </button>
                </div>
              </div>
              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-[#475569]">
                <span>Total Elemen</span>
                <span className="font-mono-tabular font-semibold text-[#0F172A]">
                  {elements.length}
                </span>
              </div>
            </section>
          </>
        ) : (
          <>
            {/* Quick Actions (works for single & multi-select) */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => duplicateSelected()}
                title="Duplikat (Ctrl+D)"
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] py-1.5 text-[#0F172A] hover:bg-[#F1F5F9]"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span>Duplikat</span>
              </button>
              <button
                type="button"
                onClick={() => updateSelectedElements({ locked: !allLocked })}
                title={allLocked ? 'Buka Kunci Semua' : 'Kunci Posisi'}
                aria-label={allLocked ? 'Buka kunci elemen terpilih' : 'Kunci elemen terpilih'}
                className="inline-flex items-center justify-center p-1.5 rounded-lg border border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]"
              >
                {allLocked ? (
                  <Lock className="h-3.5 w-3.5 text-[#B45309]" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Unlock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => deleteSelected()}
                title="Hapus (Del)"
                aria-label="Hapus elemen terpilih"
                className="inline-flex items-center justify-center p-1.5 rounded-lg border border-[#B91C1C]/30 text-[#B91C1C] hover:bg-[#FEE2E2]"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            {/* Sync same-type toggle (default ON, toggleable per board) */}
            <div
              className={`rounded-lg border px-2.5 py-2 transition-colors ${
                syncSameType
                  ? 'border-[#1D4ED8]/30 bg-[#EFF6FF]'
                  : 'border-[#E2E8F0] bg-[#F8FAFC]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-[#0F172A] flex items-center gap-1.5">
                    <span>Sinkron Sejenis</span>
                    {sameTypeTargetCount > 1 && (
                      <span className="rounded bg-[#FFFFFF] border border-[#E2E8F0] px-1.5 py-0.5 text-[10px] font-mono-tabular text-[#475569]">
                        {sameTypeTargetCount}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={syncSameType}
                  aria-label="Sinkron perubahan ke komponen sejenis"
                  title={syncSameType ? 'Nonaktifkan sinkron komponen sejenis' : 'Aktifkan sinkron komponen sejenis'}
                  onClick={() => updateSettings({ syncSameType: !syncSameType })}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
                    syncSameType
                      ? 'border-transparent bg-[#1D4ED8]'
                      : 'border-[#CBD5E1] bg-[#E2E8F0]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-xs transition-transform duration-200 ${
                      syncSameType ? 'translate-x-[17px]' : 'translate-x-[2px]'
                    }`}
                  />
                </button>
              </div>
              <p className="mt-1 text-[11px] text-[#475569] leading-snug">
                {syncSameType
                  ? sameTypeTargetCount > 1
                    ? `Ubah warna, ukuran, gaya, atau bentuk ikut menerapkan ke semua ${sameTypeTargetCount} komponen sejenis.`
                    : 'Aktif: komponen sejenis lain di papan ini ikut berubah saat diubah.'
                  : 'Mati: perubahan hanya berlaku untuk komponen yang dipilih.'}
              </p>
            </div>

            {isMulti && (
              <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-2 text-[11px] text-[#475569] flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  Komponen:{' '}
                  <strong className="font-mono-tabular text-[#0F172A]">
                    {selectedElements.length - connectorElements.length}
                  </strong>
                </span>
                <span>
                  Garis/Konektor:{' '}
                  <strong className="font-mono-tabular text-[#0F172A]">
                    {connectorElements.length}
                  </strong>
                </span>
              </div>
            )}

            {/* Manual Size & Equalize controls (works for single & multi-select shapes/symbols) */}
            {resizableElements.length > 0 && (
              <section className="space-y-2 pt-2 border-t border-[#E2E8F0]">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-[#0F172A]">
                    Ukuran Komponen{resizableElements.length > 1 ? ` (${resizableElements.length})` : ''}
                  </h3>
                  <button
                    type="button"
                    aria-label="Kunci rasio aspek"
                    aria-pressed={lockAspectRatio}
                    title={lockAspectRatio ? 'Buka kunci rasio aspek' : 'Kunci rasio aspek'}
                    onClick={() => setLockAspectRatio((v) => !v)}
                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                      lockAspectRatio
                        ? 'border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]'
                        : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]'
                    }`}
                  >
                    {lockAspectRatio ? (
                      <Link2 className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Unlink2 className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                    )}
                    <span>Rasio</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label htmlFor="prop-width-input" className="block text-[11px] text-[#475569] mb-1">
                      Lebar (px)
                    </label>
                    <div className="relative flex items-center">
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-2 text-[11px] font-semibold text-[#475569]"
                      >
                        L
                      </span>
                      <input
                        id="prop-width-input"
                        aria-label="Lebar komponen dalam piksel"
                        type="number"
                        min={MIN_ELEMENT_SIZE}
                        max={MAX_ELEMENT_SIZE}
                        step={1}
                        disabled={allResizableLocked}
                        value={
                          focusedDim === 'width'
                            ? widthDraft
                            : typeof sharedWidth === 'number'
                              ? String(sharedWidth)
                              : ''
                        }
                        placeholder={sharedWidth === '__mixed__' ? 'Campuran' : '—'}
                        onFocus={() => {
                          startDimensionSession();
                          setFocusedDim('width');
                          setWidthDraft(typeof sharedWidth === 'number' ? String(sharedWidth) : '');
                        }}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setWidthDraft(raw);
                          const parsed = Number(raw);
                          if (raw.trim() !== '' && Number.isFinite(parsed) && parsed >= MIN_ELEMENT_SIZE) {
                            applyManualDimensions({ width: parsed, respectRatio: true, useSession: true });
                          }
                        }}
                        onBlur={(e) => {
                          commitDimensionDraft('width', e.target.value);
                          setFocusedDim(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitDimensionDraft('width', e.currentTarget.value);
                            e.currentTarget.blur();
                          } else if (e.key === 'Escape') {
                            setFocusedDim(null);
                            e.currentTarget.blur();
                          }
                        }}
                        className="w-full rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] pl-6 pr-6 py-1.5 text-right font-mono-tabular text-xs text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute right-2 text-[10px] text-[#94A3B8]"
                      >
                        px
                      </span>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="prop-height-input" className="block text-[11px] text-[#475569] mb-1">
                      Tinggi (px)
                    </label>
                    <div className="relative flex items-center">
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-2 text-[11px] font-semibold text-[#475569]"
                      >
                        T
                      </span>
                      <input
                        id="prop-height-input"
                        aria-label="Tinggi komponen dalam piksel"
                        type="number"
                        min={MIN_ELEMENT_SIZE}
                        max={MAX_ELEMENT_SIZE}
                        step={1}
                        disabled={allResizableLocked}
                        value={
                          focusedDim === 'height'
                            ? heightDraft
                            : typeof sharedHeight === 'number'
                              ? String(sharedHeight)
                              : ''
                        }
                        placeholder={sharedHeight === '__mixed__' ? 'Campuran' : '—'}
                        onFocus={() => {
                          startDimensionSession();
                          setFocusedDim('height');
                          setHeightDraft(typeof sharedHeight === 'number' ? String(sharedHeight) : '');
                        }}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setHeightDraft(raw);
                          const parsed = Number(raw);
                          if (raw.trim() !== '' && Number.isFinite(parsed) && parsed >= MIN_ELEMENT_SIZE) {
                            applyManualDimensions({ height: parsed, respectRatio: true, useSession: true });
                          }
                        }}
                        onBlur={(e) => {
                          commitDimensionDraft('height', e.target.value);
                          setFocusedDim(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitDimensionDraft('height', e.currentTarget.value);
                            e.currentTarget.blur();
                          } else if (e.key === 'Escape') {
                            setFocusedDim(null);
                            e.currentTarget.blur();
                          }
                        }}
                        className="w-full rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] pl-6 pr-6 py-1.5 text-right font-mono-tabular text-xs text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute right-2 text-[10px] text-[#94A3B8]"
                      >
                        px
                      </span>
                    </div>
                  </div>
                </div>

                {/* Copy & Paste Size (works across separate components without duplicating) */}
                {(resizableElements.length === 1 && referenceRect) || copiedSize ? (
                  <div className="grid grid-cols-1 gap-1.5">
                    {resizableElements.length === 1 && referenceRect && (
                      <button
                        type="button"
                        onClick={() => {
                          setCopiedSize({ width: referenceWidth, height: referenceHeight });
                          setFeedback({
                            type: 'info',
                            message: `Ukuran ${referenceWidth} × ${referenceHeight} px disalin.`,
                          });
                        }}
                        title={`Salin ukuran ${referenceWidth} × ${referenceHeight} px untuk diterapkan ke komponen lain`}
                        className="h-8 w-full min-w-0 inline-flex items-center justify-center gap-1 rounded-md border border-[#E2E8F0] px-2 text-[11px] font-medium text-[#0F172A] hover:bg-[#F1F5F9] whitespace-nowrap"
                      >
                        <Copy className="h-3 w-3 shrink-0 text-[#475569]" strokeWidth={1.75} aria-hidden="true" />
                        <span className="truncate">Salin Ukuran</span>
                      </button>
                    )}
                    {copiedSize && (
                      <button
                        type="button"
                        disabled={allResizableLocked}
                        onClick={() =>
                          applyManualDimensions({
                            width: copiedSize.width,
                            height: copiedSize.height,
                          })
                        }
                        title={`Terapkan ukuran tersalin (${copiedSize.width} × ${copiedSize.height} px)`}
                        className="h-8 w-full min-w-0 inline-flex items-center justify-center gap-1 rounded-md border border-[#1D4ED8]/40 bg-[#EFF6FF] px-2 text-[11px] font-medium text-[#1D4ED8] hover:bg-[#DBEAFE] disabled:opacity-40 whitespace-nowrap"
                      >
                        <ClipboardPaste className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                        <span className="font-mono-tabular truncate">
                          Tempel ({copiedSize.width}×{copiedSize.height})
                        </span>
                      </button>
                    )}
                  </div>
                ) : null}

                {/* Multi-select one-click size equalization */}
                {resizableElements.length > 1 && referenceRect && (
                  <div className="space-y-1.5 pt-1">
                    <span className="block text-[11px] text-[#475569]">
                      Samakan Ukuran (acuan:{' '}
                      <strong className="font-mono-tabular text-[#0F172A]">
                        {referenceWidth}×{referenceHeight}
                      </strong>{' '}
                      px)
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        disabled={allResizableLocked}
                        title={`Samakan lebar semua ke ${referenceWidth} px`}
                        onClick={() => applyManualDimensions({ width: referenceWidth })}
                        className="py-1.5 rounded-md border border-[#E2E8F0] text-[11px] font-medium text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-40"
                      >
                        Samakan L
                      </button>
                      <button
                        type="button"
                        disabled={allResizableLocked}
                        title={`Samakan tinggi semua ke ${referenceHeight} px`}
                        onClick={() => applyManualDimensions({ height: referenceHeight })}
                        className="py-1.5 rounded-md border border-[#E2E8F0] text-[11px] font-medium text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-40"
                      >
                        Samakan T
                      </button>
                      <button
                        type="button"
                        disabled={allResizableLocked}
                        title={`Samakan lebar & tinggi semua ke ${referenceWidth} × ${referenceHeight} px`}
                        onClick={() =>
                          applyManualDimensions({
                            width: referenceWidth,
                            height: referenceHeight,
                          })
                        }
                        className="py-1.5 rounded-md border border-[#1D4ED8]/40 bg-[#EFF6FF] text-[11px] font-medium text-[#1D4ED8] hover:bg-[#DBEAFE] disabled:opacity-40"
                      >
                        Samakan L & T
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Single-element Label & Code */}
            {primary && primary.type !== 'freehand' && (
              <section className="space-y-2 pt-2 border-t border-[#E2E8F0]">
                {hasCodeField && (
                  <div>
                    <label htmlFor="prop-code" className="block text-[#475569] mb-1">
                      Kode / Tag (contoh: 1.0, D1, alt)
                    </label>
                    <input
                      id="prop-code"
                      type="text"
                      value={primary.code || ''}
                      onChange={(e) => updateElementById(primary.id, { code: e.target.value })}
                      className="w-full rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-xs font-mono-tabular text-[#0F172A]"
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label htmlFor="prop-text" className="block text-[#475569]">
                      {isErdTable ? 'Nama Tabel / Entitas' : isConnectorOnly ? 'Label Aliran / Relasi' : 'Label Teks'}
                    </label>
                    {isConnectorOnly && primary.text?.trim() && primary.labelPos && (
                      <button
                        type="button"
                        onClick={() => updateElementById(primary.id, { labelPos: null })}
                        title="Kembalikan posisi label ke titik tengah otomatis garis"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1D4ED8] hover:underline"
                      >
                        <RotateCcw className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                        Reset Posisi
                      </button>
                    )}
                  </div>
                  <textarea
                    id="prop-text"
                    rows={isConnectorOnly || isErdTable ? 1 : 2}
                    value={primary.text || ''}
                    onChange={(e) => updateElementById(primary.id, { text: e.target.value })}
                    className="w-full rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-xs text-[#0F172A] resize-y"
                  />
                  {isConnectorOnly && primary.text?.trim() && (
                    <p className="mt-1 text-[11px] text-[#64748B]">
                      Seret langsung teks label di kanvas untuk memindahkannya secara bebas ke mana saja.
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Connector properties (works for single connector OR multi-select containing connectors) */}
            {connectorElements.length > 0 && (
              <section className="space-y-2.5 pt-2 border-t border-[#E2E8F0]">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-[#0F172A]">
                    Konektor & Garis{isMulti ? ` (${connectorElements.length})` : ''}
                  </h3>
                  <div className="flex items-center gap-2">
                    {connectorElements.some((c) => c.waypoints && c.waypoints.length > 0) && (
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedElements((el) =>
                            el.type === 'connector' ? { waypoints: undefined } : null,
                          )
                        }
                        title="Kembalikan jalur garis ke rute otomatis"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#475569] hover:text-[#0F172A]"
                      >
                        <RotateCcw className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                        Reset Sudut
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedElements((el) =>
                          el.type === 'connector'
                            ? {
                                startMarker: el.endMarker || 'none',
                                endMarker: el.startMarker || 'none',
                              }
                            : null,
                        )
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1D4ED8] hover:underline"
                    >
                      <ArrowLeftRight className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                      Tukar Ujung
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-[#475569]">
                  Seret titik sudut biru untuk menggeser, seret titik tengah garis untuk menambah sudut, atau klik 2x titik untuk menghapus.
                </p>

                <div>
                  <span className="block text-[#475569] mb-1">Rute Garis</span>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'elbow', label: 'Siku 90°' },
                      { id: 'straight', label: 'Lurus' },
                      { id: 'curved', label: 'Kurva' },
                    ].map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() =>
                          updateSelectedElements(
                            (el) => (el.type === 'connector' ? { routing: r.id } : null),
                            { syncSameType: true },
                          )
                        }
                        className={`py-1.5 rounded-md border font-medium ${
                          sharedRouting === r.id
                            ? 'border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]'
                            : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <MarkerPicker
                  id="prop-start-marker"
                  label="Ujung Awal (Start)"
                  value={sharedStartMarker === '__mixed__' ? 'none' : sharedStartMarker || 'none'}
                  mixed={sharedStartMarker === '__mixed__'}
                  direction="start"
                  onChange={(val) =>
                    updateSelectedElements(
                      (el) => (el.type === 'connector' ? { startMarker: val } : null),
                      { syncSameType: true },
                    )
                  }
                />

                <MarkerPicker
                  id="prop-end-marker"
                  label="Ujung Akhir (End)"
                  value={sharedEndMarker === '__mixed__' ? 'none' : sharedEndMarker || 'none'}
                  mixed={sharedEndMarker === '__mixed__'}
                  direction="end"
                  onChange={(val) =>
                    updateSelectedElements(
                      (el) => (el.type === 'connector' ? { endMarker: val } : null),
                      { syncSameType: true },
                    )
                  }
                />

                <div
                  title="Saat aktif, garis konektor yang saling bersilang otomatis membentuk loncatan kerucut (/\\)"
                  className="flex items-center justify-between pt-1 text-[#0F172A]"
                >
                  <span>Loncatan Garis Bersilang</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.lineJumps !== false}
                    aria-label="Loncatan Garis Bersilang"
                    onClick={() => updateSettings({ lineJumps: settings.lineJumps === false })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
                      settings.lineJumps !== false
                        ? 'border-transparent bg-[#1D4ED8]'
                        : 'border-[#CBD5E1] bg-[#E2E8F0]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-xs transition-transform duration-200 ${
                        settings.lineJumps !== false ? 'translate-x-[17px]' : 'translate-x-[2px]'
                      }`}
                    />
                  </button>
                </div>
              </section>
            )}

            {/* ERD Table Fields Editor (single selection) */}
            {isErdTable && primary && (
              <section className="space-y-2 pt-2 border-t border-[#E2E8F0]">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[#0F172A]">Kolom Tabel ERD</h3>
                  <button
                    type="button"
                    onClick={() => {
                      const next = [
                        ...(primary.fields || []),
                        { id: crypto.randomUUID(), key: '', name: 'column_name', type: 'VARCHAR' },
                      ];
                      syncErdFields(primary.id, next);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1D4ED8] hover:underline"
                  >
                    <Plus className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                    Tambah Kolom
                  </button>
                </div>

                <div className="space-y-1.5">
                  {(primary.fields || []).map((field, idx) => (
                    <div key={field.id} className="grid grid-cols-[54px_1fr_64px_22px] gap-1 items-center">
                      <select
                        aria-label={`Kunci kolom ${idx + 1}`}
                        value={field.key}
                        onChange={(e) => {
                          const next = [...(primary.fields || [])];
                          next[idx] = { ...field, key: /** @type {any} */ (e.target.value) };
                          syncErdFields(primary.id, next);
                        }}
                        className="rounded border border-[#E2E8F0] bg-[#FFFFFF] px-1 py-1 text-[11px] font-mono-tabular"
                      >
                        <option value="">-</option>
                        <option value="PK">PK</option>
                        <option value="FK">FK</option>
                        <option value="PK,FK">PK,FK</option>
                      </select>
                      <input
                        aria-label={`Nama kolom ${idx + 1}`}
                        type="text"
                        value={field.name}
                        onChange={(e) => {
                          const next = [...(primary.fields || [])];
                          next[idx] = { ...field, name: e.target.value };
                          syncErdFields(primary.id, next);
                        }}
                        className="min-w-0 rounded border border-[#E2E8F0] px-1.5 py-1 text-[11px]"
                      />
                      <input
                        aria-label={`Tipe data kolom ${idx + 1}`}
                        type="text"
                        value={field.type}
                        onChange={(e) => {
                          const next = [...(primary.fields || [])];
                          next[idx] = { ...field, type: e.target.value };
                          syncErdFields(primary.id, next);
                        }}
                        className="min-w-0 rounded border border-[#E2E8F0] px-1 py-1 text-[11px] font-mono-tabular"
                      />
                      <button
                        type="button"
                        aria-label={`Hapus kolom ${idx + 1}`}
                        onClick={() => {
                          const next = (primary.fields || []).filter((_, i) => i !== idx);
                          syncErdFields(primary.id, next);
                        }}
                        className="p-0.5 text-[#475569] hover:text-[#B91C1C]"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* UML Class Editor (single selection) */}
            {isUmlClass && primary && (
              <section className="space-y-2 pt-2 border-t border-[#E2E8F0]">
                <h3 className="font-semibold text-[#0F172A]">Struktur Kelas UML</h3>
                <div>
                  <label htmlFor="uml-stereo" className="block text-[#475569] mb-1">
                    Stereotype
                  </label>
                  <input
                    id="uml-stereo"
                    type="text"
                    value={primary.stereotype || ''}
                    placeholder="<<interface>>"
                    onChange={(e) => updateElementById(primary.id, { stereotype: e.target.value })}
                    className="w-full rounded-lg border border-[#E2E8F0] px-2 py-1 text-xs font-mono-tabular"
                  />
                </div>
                <div>
                  <label htmlFor="uml-attrs" className="block text-[#475569] mb-1">
                    Atribut (1 per baris)
                  </label>
                  <textarea
                    id="uml-attrs"
                    rows={3}
                    value={(primary.attributes || []).join('\n')}
                    onChange={(e) =>
                      updateElementById(primary.id, {
                        attributes: e.target.value.split('\n').filter((l) => l.length > 0),
                      })
                    }
                    className="w-full rounded-lg border border-[#E2E8F0] px-2 py-1 text-[11px] font-mono-tabular"
                  />
                </div>
                <div>
                  <label htmlFor="uml-methods" className="block text-[#475569] mb-1">
                    Method (1 per baris)
                  </label>
                  <textarea
                    id="uml-methods"
                    rows={3}
                    value={(primary.methods || []).join('\n')}
                    onChange={(e) =>
                      updateElementById(primary.id, {
                        methods: e.target.value.split('\n').filter((l) => l.length > 0),
                      })
                    }
                    className="w-full rounded-lg border border-[#E2E8F0] px-2 py-1 text-[11px] font-mono-tabular"
                  />
                </div>
              </section>
            )}

            {/* Typography controls (works for single & multi-select) */}
            {textElements.length > 0 && (
              <section className="space-y-2.5 pt-2 border-t border-[#E2E8F0]">
                <h3 className="font-semibold text-[#0F172A]">Teks & Tipografi</h3>

                <div>
                  <span className="block text-[#475569] mb-1">Jenis Font</span>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'sans', label: 'Sans' },
                      { id: 'mono', label: 'Mono' },
                      { id: 'sketch', label: 'Sketsa' },
                    ].map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() =>
                          updateSelectedElements(
                            (el) => (el.type !== 'freehand' ? { fontFamily: font.id } : null),
                            { syncSameType: true },
                          )
                        }
                        className={`py-1.5 rounded-md border font-medium ${
                          sharedFontFamily === font.id
                            ? 'border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]'
                            : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]'
                        }`}
                      >
                        {font.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-[#475569] mb-1">Ukuran Teks (px)</span>
                  <div className="grid grid-cols-4 gap-1">
                    {FONT_SIZE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          updateSelectedElements(
                            (el) => (el.type !== 'freehand' ? { fontSize: opt.value } : null),
                            { syncSameType: true },
                          )
                        }
                        className={`py-1.5 rounded-md border font-mono-tabular font-medium ${
                          sharedFontSize === opt.value
                            ? 'border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]'
                            : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Shared Visual Controls (works for single & multi-select / Select All) */}
            <section className="space-y-2.5 pt-2 border-t border-[#E2E8F0]">
              <h3 className="font-semibold text-[#0F172A]">Tampilan Visual</h3>

              <div>
                <span className="block text-[#475569] mb-1">Warna Garis / Teks</span>
                <div className="flex flex-wrap gap-1.5">
                  {CANVAS_STROKE_SWATCHES.map((sw) => (
                    <button
                      key={sw.value}
                      type="button"
                      onClick={() =>
                        updateSelectedElements({ strokeColor: sw.value }, { syncSameType: true })
                      }
                      title={sw.label}
                      aria-label={`Warna garis ${sw.label}`}
                      className={`h-6 w-6 rounded-md border ${
                        sharedStrokeColor === sw.value
                          ? 'ring-2 ring-[#1D4ED8] ring-offset-1 border-[#0F172A]'
                          : 'border-[#E2E8F0]'
                      }`}
                      style={{ backgroundColor: sw.value }}
                    />
                  ))}
                </div>
              </div>

              {fillableElements.length > 0 && (
                <div>
                  <span className="block text-[#475569] mb-1">
                    Warna Isi{isMulti ? ` (${fillableElements.length})` : ''}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {CANVAS_FILL_SWATCHES.map((sw) => (
                      <button
                        key={sw.value}
                        type="button"
                        onClick={() =>
                          updateSelectedElements(
                            (el) => (!NON_FILLABLE_TYPES.has(el.type) ? { fillColor: sw.value } : null),
                            { syncSameType: true },
                          )
                        }
                        title={sw.label}
                        aria-label={`Warna isi ${sw.label}`}
                        className={`h-6 w-6 rounded-md border ${
                          sharedFillColor === sw.value
                            ? 'ring-2 ring-[#1D4ED8] ring-offset-1 border-[#0F172A]'
                            : 'border-[#CBD5E1]'
                        }`}
                        style={{
                          backgroundColor: sw.value === 'transparent' ? '#FFFFFF' : sw.value,
                          backgroundImage:
                            sw.value === 'transparent'
                              ? 'linear-gradient(135deg, transparent 45%, #B91C1C 45%, #B91C1C 55%, transparent 55%)'
                              : undefined,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <span className="block text-[#475569] mb-1">Ketebalan Garis</span>
                <div className="grid grid-cols-3 gap-1">
                  {STROKE_WIDTH_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        updateSelectedElements({ strokeWidth: opt.value }, { syncSameType: true })
                      }
                      className={`py-1.5 rounded-md border font-medium ${
                        sharedStrokeWidth === opt.value
                          ? 'border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]'
                          : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {styleLineElements.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[#475569]">Pola Garis</span>
                    <div
                      role="group"
                      aria-label="Cakupan pola garis"
                      className="inline-flex rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-0.5 text-[10px]"
                    >
                      <button
                        type="button"
                        aria-pressed={strokeStyleScope === 'selected'}
                        title="Hanya ubah pola garis pada elemen yang diklik/dipilih"
                        onClick={() => setStrokeStyleScope('selected')}
                        className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                          strokeStyleScope === 'selected'
                            ? 'bg-[#1D4ED8] text-white'
                            : 'text-[#475569] hover:text-[#0F172A]'
                        }`}
                      >
                        Terpilih
                      </button>
                      <button
                        type="button"
                        aria-pressed={strokeStyleScope === 'all'}
                        title="Ganti langsung pola garis semua garis/elemen sejenis di papan"
                        onClick={() => setStrokeStyleScope('all')}
                        className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                          strokeStyleScope === 'all'
                            ? 'bg-[#1D4ED8] text-white'
                            : 'text-[#475569] hover:text-[#0F172A]'
                        }`}
                      >
                        Semua
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'solid', label: 'Solid' },
                      { id: 'dashed', label: 'Putus' },
                      { id: 'dotted', label: 'Titik' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() =>
                          updateSelectedElements(
                            (el) =>
                              el.type !== 'freehand' && el.type !== 'text'
                                ? { strokeStyle: st.id }
                                : null,
                            strokeStyleScope === 'all'
                              ? { forceSyncSameType: true }
                              : { syncSameType: false },
                          )
                        }
                        className={`py-1.5 rounded-md border font-medium ${
                          sharedStrokeStyle === st.id
                            ? 'border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]'
                            : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {renderableElements.length > 0 && (
                <div>
                  <span className="block text-[#475569] mb-1">Gaya Render (Komponen, Garis & Teks)</span>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedElements(
                          (el) => (el.type !== 'freehand' ? { roughness: 0, fontFamily: 'sans' } : null),
                          { syncSameType: true },
                        )
                      }
                      className={`py-1.5 rounded-md border font-medium ${
                        sharedRenderMode === 'clean'
                          ? 'border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]'
                          : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      Teknis (Rapi)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedElements(
                          (el) =>
                            el.type !== 'freehand' ? { roughness: 1.3, fontFamily: 'sketch' } : null,
                          { syncSameType: true },
                        )
                      }
                      className={`py-1.5 rounded-md border font-medium ${
                        sharedRenderMode === 'sketch'
                          ? 'border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]'
                          : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      Sketsa Tangan
                    </button>
                  </div>
                </div>
              )}

              <div>
                <span className="block text-[#475569] mb-1">Opasitas</span>
                <div className="grid grid-cols-4 gap-1">
                  {OPACITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        updateSelectedElements({ opacity: opt.value }, { syncSameType: true })
                      }
                      className={`py-1.5 rounded-md border font-mono-tabular font-medium ${
                        sharedOpacity === opt.value
                          ? 'border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]'
                          : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Rotation controls (applies only to explicitly selected shape(s), never synced by type) */}
            {rotatableElements.length > 0 && (
              <section className="space-y-2 pt-2 border-t border-[#E2E8F0]">
                <div className="flex items-center justify-between">
                  <label htmlFor="prop-rotation-slider" className="font-semibold text-[#0F172A]">
                    Rotasi Sudut
                  </label>
                  <div className="inline-flex items-center gap-1">
                    <input
                      id="prop-rotation-input"
                      aria-label="Sudut rotasi dalam derajat"
                      type="number"
                      min={-360}
                      max={360}
                      step={1}
                      value={typeof sharedRotation === 'number' ? Math.round(sharedRotation) : ''}
                      placeholder="—"
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!Number.isFinite(val)) return;
                        const deg = normalizeRotation(val);
                        updateSelectedElements((el) =>
                          el.type !== 'connector' && el.type !== 'freehand' && !el.locked
                            ? { rotation: deg }
                            : null,
                        );
                      }}
                      className="w-16 rounded-md border border-[#E2E8F0] px-1.5 py-0.5 text-right font-mono-tabular text-xs text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                    />
                    <span className="text-[#475569] font-mono-tabular">°</span>
                  </div>
                </div>
                <input
                  id="prop-rotation-slider"
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  value={typeof sharedRotation === 'number' ? Math.round(sharedRotation) : 0}
                  onChange={(e) => {
                    const deg = normalizeRotation(Number(e.target.value));
                    updateSelectedElements((el) =>
                      el.type !== 'connector' && el.type !== 'freehand' && !el.locked
                        ? { rotation: deg }
                        : null,
                    );
                  }}
                  className="w-full accent-[#1D4ED8] cursor-pointer"
                />
                <div className="grid grid-cols-5 gap-1">
                  <button
                    type="button"
                    title="Putar 90° berlawanan jarum jam"
                    onClick={() =>
                      updateSelectedElements((el) =>
                        el.type !== 'connector' && el.type !== 'freehand' && !el.locked
                          ? { rotation: normalizeRotation((el.rotation || 0) - 90) }
                          : null,
                      )
                    }
                    className="inline-flex items-center justify-center gap-0.5 py-1.5 rounded-md border border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] font-mono-tabular"
                  >
                    <RotateCcw className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                    <span>90</span>
                  </button>
                  <button
                    type="button"
                    title="Putar 45° berlawanan jarum jam"
                    onClick={() =>
                      updateSelectedElements((el) =>
                        el.type !== 'connector' && el.type !== 'freehand' && !el.locked
                          ? { rotation: normalizeRotation((el.rotation || 0) - 45) }
                          : null,
                      )
                    }
                    className="py-1.5 rounded-md border border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] font-mono-tabular"
                  >
                    -45°
                  </button>
                  <button
                    type="button"
                    title="Reset rotasi ke 0°"
                    onClick={() =>
                      updateSelectedElements((el) =>
                        el.type !== 'connector' && el.type !== 'freehand' && !el.locked
                          ? { rotation: 0 }
                          : null,
                      )
                    }
                    className={`py-1.5 rounded-md border font-mono-tabular font-medium ${
                      sharedRotation === 0
                        ? 'border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]'
                        : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                    }`}
                  >
                    0°
                  </button>
                  <button
                    type="button"
                    title="Putar 45° searah jarum jam"
                    onClick={() =>
                      updateSelectedElements((el) =>
                        el.type !== 'connector' && el.type !== 'freehand' && !el.locked
                          ? { rotation: normalizeRotation((el.rotation || 0) + 45) }
                          : null,
                      )
                    }
                    className="py-1.5 rounded-md border border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] font-mono-tabular"
                  >
                    +45°
                  </button>
                  <button
                    type="button"
                    title="Putar 90° searah jarum jam"
                    onClick={() =>
                      updateSelectedElements((el) =>
                        el.type !== 'connector' && el.type !== 'freehand' && !el.locked
                          ? { rotation: normalizeRotation((el.rotation || 0) + 90) }
                          : null,
                      )
                    }
                    className="inline-flex items-center justify-center gap-0.5 py-1.5 rounded-md border border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] font-mono-tabular"
                  >
                    <RotateCw className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                    <span>90</span>
                  </button>
                </div>
                <p className="text-[11px] text-[#475569]">
                  Seret ikon putar di sudut kanan atas komponen untuk memutar bebas (tahan Shift untuk snap 15°).
                </p>
              </section>
            )}

            {/* Layer order (works for single & multi-select) */}
            <section className="space-y-2 pt-2 border-t border-[#E2E8F0]">
              <h3 className="font-semibold text-[#0F172A]">Urutan Lapisan</h3>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => reorderSelected('front')}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] py-1.5 text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                >
                  <ArrowUpToLine className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>Ke Depan</span>
                </button>
                <button
                  type="button"
                  onClick={() => reorderSelected('back')}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] py-1.5 text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>Ke Belakang</span>
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
