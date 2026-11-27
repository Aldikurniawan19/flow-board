import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MARKER_OPTIONS } from '../constants/tokens.js';

const MARKER_GROUPS = ['Umum', "ERD (Crow's Foot)", 'UML'];

/**
 * Render an accurate vector SVG preview of a connector endpoint marker.
 * Drawn facing right (end marker) and horizontally mirrored when direction === 'start'.
 * @param {{ marker: string, direction?: 'start' | 'end' }} props
 */
export function MarkerPreviewSvg({ marker, direction = 'end' }) {
  const mirrorTransform = direction === 'start' ? 'translate(44, 0) scale(-1, 1)' : undefined;

  return (
    <svg
      viewBox="0 0 44 18"
      className="w-11 h-4 shrink-0 text-[#0F172A]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g transform={mirrorTransform}>
        {/* Base connector shaft */}
        <line x1="3" y1="9" x2="36" y2="9" />

        {marker === 'arrow' && <path d="M 28 4 L 38 9 L 28 14" />}
        {marker === 'filled_arrow' && (
          <polygon points="28,4 39,9 28,14" fill="currentColor" stroke="none" />
        )}
        {marker === 'hollow_triangle' && (
          <polygon points="27,3.5 39,9 27,14.5" fill="var(--bg-surface)" stroke="currentColor" />
        )}
        {marker === 'circle' && <circle cx="35" cy="9" r="3.5" fill="currentColor" stroke="none" />}
        {(marker === 'diamond' || marker === 'filled_diamond') && (
          <polygon points="39,9 33,5 27,9 33,13" fill="currentColor" stroke="none" />
        )}
        {marker === 'hollow_diamond' && (
          <polygon points="39,9 33,5 27,9 33,13" fill="var(--bg-surface)" stroke="currentColor" />
        )}
        {marker === 'crow_one' && <line x1="33" y1="3.5" x2="33" y2="14.5" />}
        {marker === 'crow_one_only' && (
          <>
            <line x1="35" y1="3.5" x2="35" y2="14.5" />
            <line x1="30" y1="3.5" x2="30" y2="14.5" />
          </>
        )}
        {marker === 'crow_zero_one' && (
          <>
            <line x1="35" y1="3.5" x2="35" y2="14.5" />
            <circle cx="27.5" cy="9" r="3.5" fill="var(--bg-surface)" stroke="currentColor" />
          </>
        )}
        {marker === 'crow_many' && (
          <>
            <line x1="29" y1="9" x2="39" y2="3.5" />
            <line x1="29" y1="9" x2="39" y2="14.5" />
          </>
        )}
        {marker === 'crow_one_many' && (
          <>
            <line x1="29" y1="9" x2="39" y2="3.5" />
            <line x1="29" y1="9" x2="39" y2="14.5" />
            <line x1="28" y1="3.5" x2="28" y2="14.5" />
          </>
        )}
        {marker === 'crow_zero_many' && (
          <>
            <line x1="29" y1="9" x2="39" y2="3.5" />
            <line x1="29" y1="9" x2="39" y2="14.5" />
            <circle cx="23.5" cy="9" r="3.5" fill="var(--bg-surface)" stroke="currentColor" />
          </>
        )}
      </g>
    </svg>
  );
}

/**
 * Custom accessible dropdown picker showing vector SVG previews alongside marker descriptions.
 * @param {{
 *   id: string,
 *   label: string,
 *   value: string,
 *   mixed?: boolean,
 *   direction?: 'start' | 'end',
 *   onChange: (value: import('../types/schema.js').MarkerType) => void
 * }} props
 */
export function MarkerPicker({ id, label, value, mixed = false, direction = 'end', onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    if (!open) return undefined;

    /** @param {MouseEvent} e */
    function handleOutside(e) {
      if (rootRef.current && !rootRef.current.contains(/** @type {Node} */ (e.target))) {
        setOpen(false);
      }
    }
    /** @param {KeyboardEvent} e */
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const activeOption = MARKER_OPTIONS.find((m) => m.value === value);

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="block text-[#475569] mb-1">
        {label}
      </label>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-2.5 py-1.5 text-left text-xs text-[#0F172A] hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
      >
        <span className="flex items-center gap-2 min-w-0">
          {mixed ? (
            <span className="text-[#475569] truncate">Campuran — pilih simbol</span>
          ) : (
            <>
              <MarkerPreviewSvg marker={activeOption?.value || 'none'} direction={direction} />
              <span className="truncate">{activeOption?.label || 'Tanpa Ujung'}</span>
            </>
          )}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-[#475569] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-1.5 shadow-sm z-40 space-y-1.5"
        >
          {MARKER_GROUPS.map((group) => (
            <div key={group}>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#475569]">
                {group}
              </div>
              <div className="space-y-0.5">
                {MARKER_OPTIONS.filter((m) => m.group === group).map((m) => {
                  const selected = !mixed && value === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onChange(/** @type {import('../types/schema.js').MarkerType} */ (m.value));
                        setOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                        selected
                          ? 'bg-[#DBEAFE] text-[#1D4ED8] font-medium'
                          : 'text-[#0F172A] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      <MarkerPreviewSvg marker={m.value} direction={direction} />
                      <span className="truncate">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** @type {Array<{ value: import('../types/schema.js').RoutingMode, label: string }>} */
const ROUTING_OPTIONS = [
  { value: 'elbow', label: 'Siku 90° (Orthogonal)' },
  { value: 'straight', label: 'Garis Lurus' },
  { value: 'curved', label: 'Kurva Halus' },
];

/**
 * Render a vector SVG preview of a connector routing mode matching MarkerPreviewSvg proportions.
 * @param {{ routing: string }} props
 */
export function RoutingPreviewSvg({ routing }) {
  return (
    <svg
      viewBox="0 0 44 18"
      className="w-11 h-4 shrink-0 text-[#0F172A]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {routing === 'elbow' && (
        <>
          <path d="M 4 4 H 21 V 14 H 36" />
          <polygon points="33,10.5 40,14 33,17.5" fill="currentColor" stroke="none" />
        </>
      )}
      {routing === 'straight' && (
        <>
          <line x1="4" y1="14" x2="36" y2="5" />
          <polygon points="32,2.8 40,3.9 34.4,9.2" fill="currentColor" stroke="none" />
        </>
      )}
      {routing === 'curved' && (
        <>
          <path d="M 4 14 C 17 14, 22 4, 36 4" />
          <polygon points="33,0.8 40,4 33,7.2" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}

/**
 * Custom accessible dropdown picker for connector routing mode matching MarkerPicker design.
 * @param {{
 *   id: string,
 *   label: string,
 *   value: string,
 *   shortcut?: string,
 *   onChange: (value: import('../types/schema.js').RoutingMode) => void
 * }} props
 */
export function RoutingPicker({ id, label, value, shortcut, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    if (!open) return undefined;

    /** @param {MouseEvent} e */
    function handleOutside(e) {
      if (rootRef.current && !rootRef.current.contains(/** @type {Node} */ (e.target))) {
        setOpen(false);
      }
    }
    /** @param {KeyboardEvent} e */
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const activeOption = ROUTING_OPTIONS.find((opt) => opt.value === value) || ROUTING_OPTIONS[0];

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center justify-between gap-2 mb-1">
        <label htmlFor={id} className="block text-[#475569]">
          {label}
        </label>
        {shortcut && (
          <kbd
            title={`Tekan ${shortcut} untuk mengganti tipe jalur`}
            className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] font-mono-tabular font-medium text-[#475569] leading-none"
          >
            {shortcut}
          </kbd>
        )}
      </div>
      <button
        id={id}
        type="button"
        title={shortcut ? `${label} (${shortcut})` : label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-2.5 py-1.5 text-left text-xs text-[#0F172A] hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
      >
        <span className="flex items-center gap-2 min-w-0">
          <RoutingPreviewSvg routing={activeOption.value} />
          <span className="truncate">{activeOption.label}</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-[#475569] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 mt-1 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-1.5 shadow-sm z-40 space-y-0.5"
        >
          {ROUTING_OPTIONS.map((opt) => {
            const selected = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                  selected
                    ? 'bg-[#DBEAFE] text-[#1D4ED8] font-medium'
                    : 'text-[#0F172A] hover:bg-[#F1F5F9]'
                }`}
              >
                <RoutingPreviewSvg routing={opt.value} />
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
