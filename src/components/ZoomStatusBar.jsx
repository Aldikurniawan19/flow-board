import { useState } from 'react';
import { Grid, HelpCircle, Magnet, Maximize2, Minus, Plus } from 'lucide-react';
import { clampZoom } from '../engine/camera.js';
import { computeSceneBounds } from '../engine/exporter.js';
import { useBoardStore } from '../store/useBoardStore.js';

export function ZoomStatusBar() {
  const [helpOpen, setHelpOpen] = useState(false);
  const camera = useBoardStore((s) => s.camera);
  const settings = useBoardStore((s) => s.settings);
  const elements = useBoardStore((s) => s.elements);
  const setCamera = useBoardStore((s) => s.setCamera);
  const updateSettings = useBoardStore((s) => s.updateSettings);

  function zoomBy(delta) {
    setCamera({ ...camera, zoom: clampZoom(camera.zoom + delta) });
  }

  function fitToContent() {
    if (elements.length === 0) {
      setCamera({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const bounds = computeSceneBounds(elements);
    const viewW = Math.max(360, window.innerWidth - 560);
    const viewH = Math.max(300, window.innerHeight - 120);
    const zoom = clampZoom(Math.min(viewW / bounds.width, viewH / bounds.height, 1.2));
    setCamera({
      zoom,
      x: viewW / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: viewH / 2 - (bounds.y + bounds.height / 2) * zoom,
    });
  }

  function cycleGrid() {
    const order = /** @type {const} */ (['dots', 'lines', 'none']);
    const next = order[(order.indexOf(settings.gridMode) + 1) % order.length];
    updateSettings({ gridMode: next });
  }

  return (
    <div className="absolute bottom-3 left-3 right-3 z-20 pointer-events-none flex items-center justify-between gap-2">
      <div className="pointer-events-auto inline-flex items-center gap-1 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-1.5 py-1 shadow-sm">
        <button
          type="button"
          onClick={() => zoomBy(-0.15)}
          title="Perkecil kanvas (Ctrl+-)"
          aria-label="Perkecil kanvas"
          className="p-1.5 rounded-lg text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setCamera({ ...camera, zoom: 1 })}
          title="Reset zoom ke 100% (Ctrl+0)"
          className="px-2 py-1 rounded-md text-xs font-mono-tabular font-medium text-[#0F172A] hover:bg-[#F1F5F9]"
        >
          {Math.round(camera.zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => zoomBy(0.15)}
          title="Perbesar kanvas (Ctrl++)"
          aria-label="Perbesar kanvas"
          className="p-1.5 rounded-lg text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>

        <div className="h-4 w-px bg-[#E2E8F0] mx-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={fitToContent}
          title="Sesuaikan tampilan ke seluruh diagram"
          aria-label="Sesuaikan tampilan ke seluruh diagram"
          className="p-1.5 rounded-lg text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
        >
          <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={cycleGrid}
          title={`Mode grid: ${settings.gridMode}`}
          aria-label="Ubah tampilan grid"
          className={`p-1.5 rounded-lg ${
            settings.gridMode !== 'none'
              ? 'bg-[#F1F5F9] text-[#0F172A]'
              : 'text-[#475569] hover:bg-[#F1F5F9]'
          }`}
        >
          <Grid className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => updateSettings({ snapToGrid: !settings.snapToGrid })}
          title={settings.snapToGrid ? 'Snap grid aktif' : 'Snap grid nonaktif'}
          aria-label="Aktifkan atau nonaktifkan snap ke grid"
          aria-pressed={settings.snapToGrid}
          className={`p-1.5 rounded-lg ${
            settings.snapToGrid
              ? 'bg-[#DBEAFE] text-[#1D4ED8]'
              : 'text-[#475569] hover:bg-[#F1F5F9]'
          }`}
        >
          <Magnet className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div className="pointer-events-auto relative">
        <button
          type="button"
          onClick={() => setHelpOpen((v) => !v)}
          aria-label="Pintasan keyboard"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] shadow-sm"
        >
          <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden sm:inline">Pintasan</span>
        </button>

        {helpOpen && (
          <div className="absolute right-0 bottom-10 w-64 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-3 shadow-sm text-xs">
            <h3 className="font-semibold text-[#0F172A] mb-2">Pintasan Keyboard</h3>
            <dl className="space-y-1 text-[#475569]">
              <div className="flex justify-between">
                <dt>Pilih / Geser</dt>
                <dd className="font-mono-tabular text-[#0F172A]">V / H / Spasi</dd>
              </div>
              <div className="flex justify-between">
                <dt>Pena / Stabilo / Hapus</dt>
                <dd className="font-mono-tabular text-[#0F172A]">P / M / E</dd>
              </div>
              <div className="flex justify-between">
                <dt>Konektor / Teks</dt>
                <dd className="font-mono-tabular text-[#0F172A]">C / T</dd>
              </div>
              <div className="flex justify-between">
                <dt>Edit Teks Elemen</dt>
                <dd className="font-mono-tabular text-[#0F172A]">Klik 2x</dd>
              </div>
              <div className="flex justify-between">
                <dt>Zoom In / Out / 100%</dt>
                <dd className="font-mono-tabular text-[#0F172A]">Ctrl + Scroll / +/-/0</dd>
              </div>
              <div className="flex justify-between">
                <dt>Undo / Redo</dt>
                <dd className="font-mono-tabular text-[#0F172A]">Ctrl+Z / Ctrl+Y</dd>
              </div>
              <div className="flex justify-between">
                <dt>Panel Kiri / Kanan / Semua</dt>
                <dd className="font-mono-tabular text-[#0F172A]">[ / ] / \</dd>
              </div>
              <div className="flex justify-between">
                <dt>Geser Elemen</dt>
                <dd className="font-mono-tabular text-[#0F172A]">Panah / Shift+Panah</dd>
              </div>
              <div className="flex justify-between">
                <dt>Duplikat / Hapus</dt>
                <dd className="font-mono-tabular text-[#0F172A]">Ctrl+D / Del</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
