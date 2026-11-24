import {
  ArrowRight,
  Circle,
  Diamond,
  Eraser,
  Hand,
  Highlighter,
  MousePointer2,
  Pencil,
  Redo2,
  Shapes,
  Square,
  StickyNote,
  Type,
  Undo2,
} from 'lucide-react';
import { useBoardStore } from '../store/useBoardStore.js';

const CORE_TOOLS = [
  { id: 'select', label: 'Pilih (V)', shortcut: 'V', icon: MousePointer2 },
  { id: 'hand', label: 'Geser Kanvas (H)', shortcut: 'H', icon: Hand },
  { id: 'pen', label: 'Pena Bebas (P)', shortcut: 'P', icon: Pencil },
  { id: 'highlighter', label: 'Stabilo (M)', shortcut: 'M', icon: Highlighter },
  { id: 'eraser', label: 'Hapus Goresan (E)', shortcut: 'E', icon: Eraser },
  { id: 'rectangle', label: 'Persegi (R)', shortcut: 'R', icon: Square },
  { id: 'diamond', label: 'Belah Ketupat (D)', shortcut: 'D', icon: Diamond },
  { id: 'ellipse', label: 'Elips (O)', shortcut: 'O', icon: Circle },
  { id: 'connector', label: 'Konektor / Panah (C)', shortcut: 'C', icon: ArrowRight },
  { id: 'text', label: 'Teks (T)', shortcut: 'T', icon: Type },
  { id: 'sticky_note', label: 'Catatan Tempel (S)', shortcut: 'S', icon: StickyNote },
];

export function TopToolbar() {
  const activeTool = useBoardStore((s) => s.activeTool);
  const setActiveTool = useBoardStore((s) => s.setActiveTool);
  const autoCorrectShapes = useBoardStore((s) => s.settings.autoCorrectShapes !== false);
  const updateSettings = useBoardStore((s) => s.updateSettings);
  const canUndo = useBoardStore((s) => s.past.length > 0);
  const canRedo = useBoardStore((s) => s.future.length > 0);
  const undo = useBoardStore((s) => s.undo);
  const redo = useBoardStore((s) => s.redo);

  return (
    <nav
      aria-label="Alat gambar utama"
      className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-2 py-1.5 shadow-sm max-w-[calc(100%-24px)] overflow-x-auto"
    >
      {CORE_TOOLS.map((tool) => {
        const Icon = tool.icon;
        const active = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => setActiveTool(tool.id)}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={active}
            className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
              active
                ? 'bg-[#1D4ED8] text-white'
                : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
            }`}
          >
            <Icon className="h-4 w-4 -translate-y-0.5" strokeWidth={1.75} aria-hidden="true" />
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute bottom-0.5 right-1 text-[9px] leading-none font-mono-tabular font-semibold ${
                active ? 'text-white/90' : 'text-[#475569]'
              }`}
            >
              {tool.shortcut}
            </span>
          </button>
        );
      })}

      <div className="h-5 w-px bg-[#E2E8F0] mx-1 shrink-0" aria-hidden="true" />

      <button
        type="button"
        onClick={() => updateSettings({ autoCorrectShapes: !autoCorrectShapes })}
        title={
          autoCorrectShapes
            ? 'Auto-koreksi bentuk pena aktif (klik untuk matikan)'
            : 'Auto-koreksi bentuk pena nonaktif (klik untuk aktifkan)'
        }
        aria-label="Koreksi bentuk otomatis saat menggunakan pena"
        aria-pressed={autoCorrectShapes}
        className={`flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
          autoCorrectShapes
            ? 'bg-[#DBEAFE] text-[#1D4ED8]'
            : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
        }`}
      >
        <Shapes className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <span className="hidden lg:inline">Auto</span>
      </button>

      <div className="h-5 w-px bg-[#E2E8F0] mx-1 shrink-0" aria-hidden="true" />

      <button
        type="button"
        onClick={() => undo()}
        disabled={!canUndo}
        title="Batalkan (Ctrl+Z)"
        aria-label="Batalkan (Ctrl+Z)"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] disabled:opacity-35 disabled:hover:bg-transparent shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
      >
        <Undo2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => redo()}
        disabled={!canRedo}
        title="Ulangi (Ctrl+Y)"
        aria-label="Ulangi (Ctrl+Y)"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] disabled:opacity-35 disabled:hover:bg-transparent shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
      >
        <Redo2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </nav>
  );
}
