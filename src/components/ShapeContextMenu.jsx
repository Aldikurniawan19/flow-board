import { useEffect, useMemo, useRef, useState } from 'react';
import { Repeat2, Search, X } from 'lucide-react';
import { SHAPE_CATEGORIES, SHAPE_DEFINITIONS } from '../engine/shapeRegistry.js';
import { ShapePreviewIcon } from './ShapeLibrarySidebar.jsx';

const CATEGORY_SHORT_LABELS = {
  basic: 'Dasar',
  rich_picture: 'Rich Picture',
  flowchart: 'Flowchart',
  bpmn: 'BPMN',
  dfd: 'DFD',
  erd: 'ERD',
  uml: 'UML',
  arch: 'Arsitektur',
};

/**
 * Floating right-click context menu for swapping selected shape/symbol component(s) into another shape.
 * @param {{
 *   x: number,
 *   y: number,
 *   containerWidth: number,
 *   containerHeight: number,
 *   currentType: string,
 *   selectedCount: number,
 *   sameTypeCount?: number,
 *   syncSameType?: boolean,
 *   onToggleSyncSameType?: () => void,
 *   onSelectShape: (targetType: string) => void,
 *   onClose: () => void
 * }} props
 */
export function ShapeContextMenu({
  x,
  y,
  containerWidth,
  containerHeight,
  currentType,
  selectedCount,
  sameTypeCount = 1,
  syncSameType = true,
  onToggleSyncSameType,
  onSelectShape,
  onClose,
}) {
  const menuRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const initialCategory = useMemo(() => {
    const found = SHAPE_DEFINITIONS.find((d) => d.type === currentType);
    return found ? found.category : 'all';
  }, [currentType]);

  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState('');

  useEffect(() => {
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
  }, [onClose]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredShapes = useMemo(() => {
    return SHAPE_DEFINITIONS.filter((def) => {
      if (normalizedQuery) {
        return (
          def.label.toLowerCase().includes(normalizedQuery) ||
          def.keywords.some((k) => k.toLowerCase().includes(normalizedQuery))
        );
      }
      if (category === 'all') return true;
      return def.category === category;
    });
  }, [category, normalizedQuery]);

  const menuW = 296;
  const menuH = 360;
  const left = Math.max(8, Math.min(x, Math.max(8, containerWidth - menuW - 8)));
  const top = Math.max(8, Math.min(y, Math.max(8, containerHeight - menuH - 8)));

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Ganti bentuk komponen"
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: `${left}px`, top: `${top}px`, width: `${menuW}px` }}
      className="absolute z-40 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-sm flex flex-col overflow-hidden text-xs"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Repeat2 className="h-3.5 w-3.5 text-[#1D4ED8] shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="font-semibold text-[#0F172A] truncate">
            Ganti Bentuk{selectedCount > 1 ? ` (${selectedCount})` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup menu ganti bentuk"
          className="p-1 rounded-md text-[#475569] hover:bg-[#E2E8F0]/70 hover:text-[#0F172A]"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {sameTypeCount > 1 && onToggleSyncSameType && (
        <div className="px-3 py-1.5 border-b border-[#E2E8F0] flex items-center justify-between gap-2 text-[11px]">
          <span className="text-[#475569]">
            Sinkron sejenis (<strong className="font-mono-tabular text-[#0F172A]">{sameTypeCount}</strong>)
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={syncSameType}
            aria-label="Sinkron ganti bentuk ke komponen sejenis"
            title={syncSameType ? 'Nonaktifkan sinkron sejenis' : 'Aktifkan sinkron sejenis'}
            onClick={onToggleSyncSameType}
            className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
              syncSameType
                ? 'border-transparent bg-[#1D4ED8]'
                : 'border-[#CBD5E1] bg-[#E2E8F0]'
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-xs transition-transform duration-200 ${
                syncSameType ? 'translate-x-[15px]' : 'translate-x-[2px]'
              }`}
            />
          </button>
        </div>
      )}

      {/* Search & Category Pills */}
      <div className="p-2 border-b border-[#E2E8F0] space-y-2">
        <div className="relative">
          <Search
            className="h-3.5 w-3.5 text-[#475569] absolute left-2.5 top-1/2 -translate-y-1/2"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <input
            type="search"
            autoFocus
            aria-label="Cari bentuk pengganti"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari bentuk (DFD, ERD, UML, oval...)"
            className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-8 pr-2.5 py-1.5 text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-[#FFFFFF] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
          />
        </div>

        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
              !normalizedQuery && category === 'all'
                ? 'bg-[#DBEAFE] text-[#1D4ED8]'
                : 'bg-[#F1F5F9] text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Semua
          </button>
          {SHAPE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setQuery('');
                setCategory(cat.id);
              }}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                !normalizedQuery && category === cat.id
                  ? 'bg-[#DBEAFE] text-[#1D4ED8]'
                  : 'bg-[#F1F5F9] text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              {CATEGORY_SHORT_LABELS[cat.id] || cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Shape Grid */}
      <div className="max-h-56 overflow-y-auto p-2">
        {filteredShapes.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-[#475569]">
            Bentuk tidak ditemukan.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {filteredShapes.map((shape) => {
              const isCurrent = shape.type === currentType;
              return (
                <button
                  key={shape.type}
                  type="button"
                  role="menuitem"
                  onClick={() => onSelectShape(shape.type)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
                    isCurrent
                      ? 'border-[#1D4ED8] bg-[#DBEAFE]/50 text-[#1D4ED8] font-medium'
                      : 'border-[#E2E8F0] bg-[#FFFFFF] text-[#0F172A] hover:bg-[#F1F5F9] hover:border-[#CBD5E1]'
                  }`}
                >
                  <ShapePreviewIcon preview={shape.preview} className="w-7 h-5 shrink-0" />
                  <span className="text-[11px] leading-tight line-clamp-2">{shape.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
