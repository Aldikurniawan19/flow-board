import { useEffect, useMemo, useRef } from 'react';
import { SHAPE_DEFINITIONS } from '../engine/shapeRegistry.js';
import { ShapePreviewIcon } from './ShapeLibrarySidebar.jsx';

/** 4 common shapes shown in the translucent quick strip when hovering a quick-connect arrow */
export const QUICK_CONNECT_HOVER_TYPES = ['ellipse', 'rectangle', 'rounded_rect', 'diamond'];

/** 8 common shapes shown in the compact 4x2 grid popover when clicking a quick-connect arrow */
export const QUICK_CONNECT_CLICK_TYPES = [
  'ellipse',
  'rectangle',
  'rounded_rect',
  'diamond',
  'fc_io',
  'fc_database',
  'fc_document',
  'hexagon',
];

/**
 * Draw.io-style quick-connect floating shape picker.
 * - `mode="hover"`: subtle translucent strip beside the hovered arrow (4 common shapes)
 * - `mode="click"`: compact 4x2 card popover beside the clicked arrow (8 common shapes)
 *
 * @param {{
 *   mode: 'hover' | 'click',
 *   side: import('../types/schema.js').PortSide,
 *   anchorScreen: { x: number, y: number },
 *   containerWidth: number,
 *   containerHeight: number,
 *   theme: 'light' | 'dark',
 *   onSelectShape: (targetType: string) => void,
 *   onMouseEnter?: () => void,
 *   onMouseLeave?: () => void,
 *   onClose: () => void,
 * }} props
 */
export function QuickConnectMenu({
  mode,
  side,
  anchorScreen,
  containerWidth,
  containerHeight,
  theme,
  onSelectShape,
  onMouseEnter,
  onMouseLeave,
  onClose,
}) {
  const menuRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const isDark = theme === 'dark';

  const shapes = useMemo(() => {
    const types = mode === 'hover' ? QUICK_CONNECT_HOVER_TYPES : QUICK_CONNECT_CLICK_TYPES;
    const byType = new Map(SHAPE_DEFINITIONS.map((d) => [d.type, d]));
    return types
      .map((t) => byType.get(t))
      .filter((d) => /** @type {import('../engine/shapeRegistry.js').ShapeDefinition | undefined} */ (d) !== undefined);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'click') return undefined;
    /** @param {KeyboardEvent} e */
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    /** @param {PointerEvent} e */
    function handleOutsidePointer(e) {
      if (menuRef.current && !menuRef.current.contains(/** @type {Node} */ (e.target))) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handleOutsidePointer, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handleOutsidePointer, true);
    };
  }, [mode, onClose]);

  const isHorizontalStrip = mode === 'hover' && (side === 'top' || side === 'bottom');
  const menuW = mode === 'hover' ? (isHorizontalStrip ? 204 : 58) : 212;
  const menuH = mode === 'hover' ? (isHorizontalStrip ? 56 : 204) : 112;
  const gap = mode === 'hover' ? 14 : 18;

  let rawLeft = anchorScreen.x + gap;
  let rawTop = anchorScreen.y - menuH / 2;

  if (side === 'left') {
    rawLeft = anchorScreen.x - menuW - gap;
    rawTop = anchorScreen.y - menuH / 2;
  } else if (side === 'top') {
    rawLeft = anchorScreen.x - menuW / 2;
    rawTop = anchorScreen.y - menuH - gap;
  } else if (side === 'bottom') {
    rawLeft = anchorScreen.x - menuW / 2;
    rawTop = anchorScreen.y + gap;
  }

  const left = Math.max(8, Math.min(rawLeft, Math.max(8, containerWidth - menuW - 8)));
  const top = Math.max(8, Math.min(rawTop, Math.max(8, containerHeight - menuH - 8)));

  if (mode === 'hover') {
    return (
      <div
        ref={menuRef}
        role="menu"
        aria-label="Tambah simbol cepat"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ left: `${left}px`, top: `${top}px` }}
        className="absolute z-30 p-1.5 -m-1.5"
      >
        <div
          className={`flex ${isHorizontalStrip ? 'flex-row' : 'flex-col'} items-center gap-1 rounded-2xl p-1.5 border backdrop-blur-xs transition-opacity ${
            isDark
              ? 'bg-[#121212]/70 border-white/[0.10]'
              : 'bg-white/85 border-slate-300/75 shadow-sm'
          }`}
        >
          {shapes.map((def) => (
            <button
              key={def.type}
              type="button"
              role="menuitem"
              title={`Tambah ${def.label}`}
              aria-label={`Tambah ${def.label}`}
              onClick={() => onSelectShape(def.type)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors cursor-pointer ${
                isDark
                  ? 'text-[#71717A] hover:text-[#38BDF8] hover:bg-[#38BDF8]/15'
                  : 'text-slate-400 hover:text-[#0284C7] hover:bg-sky-50'
              }`}
            >
              <ShapePreviewIcon preview={def.preview} className="w-8 h-6" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Pilih simbol lanjutan"
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: `${left}px`, top: `${top}px`, width: `${menuW}px` }}
      className={`absolute z-40 rounded-2xl border p-2.5 shadow-xl ${
        isDark
          ? 'bg-[#161618] border-[#2C2C30]'
          : 'bg-white border-slate-200'
      }`}
    >
      <div className="grid grid-cols-4 gap-1.5">
        {shapes.map((def) => (
          <button
            key={def.type}
            type="button"
            role="menuitem"
            title={`Tambah ${def.label}`}
            aria-label={`Tambah ${def.label}`}
            onClick={() => onSelectShape(def.type)}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors cursor-pointer ${
              isDark
                ? 'text-[#D4D4D8] hover:bg-[#27272A] hover:text-[#38BDF8]'
                : 'text-slate-600 hover:bg-sky-50 hover:text-[#0284C7]'
            }`}
          >
            <ShapePreviewIcon preview={def.preview} className="w-8 h-6" />
          </button>
        ))}
      </div>
    </div>
  );
}
