import { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Code2,
  Download,
  FolderPlus,
  Layers,
  Loader2,
  LogOut,
  PenTool,
  RefreshCw,
  Ruler,
  Trash2,
} from 'lucide-react';
import { useBoardStore } from '../store/useBoardStore.js';

/**
 * @param {{
 *   onOpenExport: () => void,
 *   onOpenPlantText: () => void
 * }} props
 */
export function HeaderBar({ onOpenExport, onOpenPlantText }) {
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);

  const user = useBoardStore((s) => s.user);
  const boards = useBoardStore((s) => s.boards);
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const boardTitle = useBoardStore((s) => s.boardTitle);
  const saveStatus = useBoardStore((s) => s.saveStatus);
  const renderMode = useBoardStore((s) => s.settings.renderMode);

  const renameBoard = useBoardStore((s) => s.renameBoard);
  const selectBoard = useBoardStore((s) => s.selectBoard);
  const createNewBoard = useBoardStore((s) => s.createNewBoard);
  const deleteActiveBoard = useBoardStore((s) => s.deleteActiveBoard);
  const saveActiveBoard = useBoardStore((s) => s.saveActiveBoard);
  const updateSettings = useBoardStore((s) => s.updateSettings);
  const logout = useBoardStore((s) => s.logout);

  return (
    <header className="h-14 shrink-0 bg-[#FFFFFF] border-b border-[#E2E8F0] px-3 flex items-center justify-between gap-2 z-30">
      <div className="flex items-center gap-2 min-w-0">
        <div className="hidden sm:flex items-center gap-2 pr-2 border-r border-[#E2E8F0]">
          <div className="h-7 w-7 rounded-md bg-[#1D4ED8] text-white flex items-center justify-center">
            <Layers className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold text-[#0F172A]">FlowBoard</span>
        </div>

        {/* Board Switcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setBoardMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
          >
            <span className="font-mono-tabular">Papan ({boards.length})</span>
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>

          {boardMenuOpen && (
            <div className="absolute left-0 mt-1.5 w-64 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-sm p-2 z-50">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#E2E8F0] mb-1">
                <span className="text-xs font-semibold text-[#0F172A]">Daftar Papan Kerja</span>
                <button
                  type="button"
                  onClick={() => {
                    setBoardMenuOpen(false);
                    createNewBoard('');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:text-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] rounded px-1"
                >
                  <FolderPlus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>Baru</span>
                </button>
              </div>
              <ul className="max-h-56 overflow-y-auto space-y-0.5">
                {boards.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setBoardMenuOpen(false);
                        if (b.id !== activeBoardId) selectBoard(b.id);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-xs truncate transition-colors ${
                        b.id === activeBoardId
                          ? 'bg-[#DBEAFE] text-[#1D4ED8] font-semibold'
                          : 'text-[#0F172A] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      {b.title}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 pt-2 border-t border-[#E2E8F0] flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setBoardMenuOpen(false);
                    deleteActiveBoard();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[#B91C1C] hover:bg-[#FEE2E2]"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>Hapus Papan Aktif</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Editable Title */}
        <label htmlFor="board-title-input" className="sr-only">
          Judul papan kerja
        </label>
        <input
          id="board-title-input"
          type="text"
          value={boardTitle}
          onChange={(e) => renameBoard(e.target.value)}
          className="min-w-0 w-32 sm:w-48 md:w-56 rounded-md border border-transparent hover:border-[#E2E8F0] focus:border-[#1D4ED8] bg-transparent focus:bg-[#FFFFFF] px-2 py-1 text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 truncate"
        />

        {/* Save Status */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs">
          {saveStatus === 'saving' && (
            <span className="inline-flex items-center gap-1 text-[#475569]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} aria-hidden="true" />
              Menyimpan...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1 text-[#15803D]">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Tersimpan
            </span>
          )}
          {saveStatus === 'dirty' && (
            <span className="text-[#B45309]">Belum disimpan</span>
          )}
          {saveStatus === 'error' && (
            <button
              type="button"
              onClick={() => saveActiveBoard()}
              className="inline-flex items-center gap-1 text-[#B91C1C] hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Simpan ulang
            </button>
          )}
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Clean vs Sketch Mode Switch */}
        <div
          role="group"
          aria-label="Mode tampilan gambar"
          className="hidden md:inline-flex items-center p-0.5 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9]"
        >
          <button
            type="button"
            onClick={() => updateSettings({ renderMode: 'clean' })}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              renderMode === 'clean'
                ? 'bg-[#FFFFFF] text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <Ruler className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span>Teknis</span>
          </button>
          <button
            type="button"
            onClick={() => updateSettings({ renderMode: 'sketch' })}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              renderMode === 'sketch'
                ? 'bg-[#FFFFFF] text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <PenTool className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span>Sketsa</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenPlantText}
          title="Generate diagram dari kode PlantText / PlantUML"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
        >
          <Code2 className="h-3.5 w-3.5 text-[#1D4ED8]" strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden sm:inline">PlantText</span>
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden sm:inline">Ekspor / Impor</span>
        </button>

        {user && (
          <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-[#E2E8F0]">
            <span className="text-xs font-medium text-[#475569] max-w-28 truncate" title={user.email}>
              {user.name}
            </span>
            <button
              type="button"
              onClick={() => logout()}
              aria-label="Keluar akun"
              title="Keluar akun"
              className="p-1.5 rounded-lg text-[#475569] hover:bg-[#FEE2E2] hover:text-[#B91C1C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
