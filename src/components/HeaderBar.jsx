import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Code2,
  Download,
  FolderPlus,
  Layers,
  Loader2,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Pencil,
  PenTool,
  RefreshCw,
  Ruler,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useBoardStore } from '../store/useBoardStore.js';

/**
 * @param {{
 *   onOpenExport: () => void,
 *   onOpenPlantText: () => void,
 *   onOpenAiIntegration: () => void
 * }} props
 */
export function HeaderBar({ onOpenExport, onOpenPlantText, onOpenAiIntegration }) {
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [boardPendingDelete, setBoardPendingDelete] = useState(
    /** @type {{ id: string, title: string } | null} */ (null),
  );
  const [deletingBoard, setDeletingBoard] = useState(false);
  const [toolsMenuHover, setToolsMenuHover] = useState(false);
  const [toolsMenuPinned, setToolsMenuPinned] = useState(false);
  const toolsMenuOpen = toolsMenuHover || toolsMenuPinned;
  const boardMenuRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const toolsMenuRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const closeToolsTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));

  const user = useBoardStore((s) => s.user);
  const boards = useBoardStore((s) => s.boards);
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const boardTitle = useBoardStore((s) => s.boardTitle);
  const saveStatus = useBoardStore((s) => s.saveStatus);
  const renderMode = useBoardStore((s) => s.settings.renderMode);
  const theme = useBoardStore((s) => s.theme);

  const renameBoard = useBoardStore((s) => s.renameBoard);
  const selectBoard = useBoardStore((s) => s.selectBoard);
  const createNewBoard = useBoardStore((s) => s.createNewBoard);
  const deleteBoardById = useBoardStore((s) => s.deleteBoardById);
  const saveActiveBoard = useBoardStore((s) => s.saveActiveBoard);
  const updateSettings = useBoardStore((s) => s.updateSettings);
  const toggleTheme = useBoardStore((s) => s.toggleTheme);
  const logout = useBoardStore((s) => s.logout);
  const guestPreviewMode = useBoardStore((s) => s.guestPreviewMode);
  const enterAuthFromGuest = useBoardStore((s) => s.enterAuthFromGuest);

  function cancelToolsCloseTimer() {
    if (closeToolsTimerRef.current) {
      clearTimeout(closeToolsTimerRef.current);
      closeToolsTimerRef.current = null;
    }
  }

  function closeToolsMenu() {
    cancelToolsCloseTimer();
    setToolsMenuHover(false);
    setToolsMenuPinned(false);
  }

  function handleToolsMouseEnter() {
    cancelToolsCloseTimer();
    setBoardMenuOpen(false);
    setToolsMenuHover(true);
  }

  function handleToolsMouseLeave() {
    cancelToolsCloseTimer();
    closeToolsTimerRef.current = setTimeout(() => {
      setToolsMenuHover(false);
    }, 120);
  }

  useEffect(() => {
    /** @param {MouseEvent} e */
    function handleOutsideClick(e) {
      const target = /** @type {Node} */ (e.target);
      if (boardMenuRef.current && !boardMenuRef.current.contains(target)) {
        setBoardMenuOpen(false);
      }
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(target)) {
        setToolsMenuHover(false);
        setToolsMenuPinned(false);
      }
    }
    /** @param {KeyboardEvent} e */
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setBoardMenuOpen(false);
        setToolsMenuHover(false);
        setToolsMenuPinned(false);
        setBoardPendingDelete(null);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelToolsCloseTimer();
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const activeBoardIndex = boards.findIndex((b) => b.id === activeBoardId);
  const activeBoardLabel =
    boards.length > 0
      ? `Papan ${activeBoardIndex >= 0 ? activeBoardIndex + 1 : 1}/${boards.length}`
      : 'Papan (0)';

  async function handleConfirmDeleteBoard() {
    if (!boardPendingDelete || deletingBoard) return;
    setDeletingBoard(true);
    try {
      await deleteBoardById(boardPendingDelete.id);
      setBoardPendingDelete(null);
    } finally {
      setDeletingBoard(false);
    }
  }

  return (
    <>
    <header className="h-12 shrink-0 bg-[#FFFFFF] border-b border-[#E2E8F0] px-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 z-30">
      {/* Left: Brand, Board Switcher & Save Status */}
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="hidden sm:flex items-center gap-1.5 pr-2 border-r border-[#E2E8F0] shrink-0">
          <div className="h-6 w-6 rounded-md bg-[#1D4ED8] text-white flex items-center justify-center shrink-0">
            <Layers className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <span className="text-xs font-semibold text-[#0F172A]">FlowBoard</span>
        </div>

        {/* Board Switcher */}
        <div ref={boardMenuRef} className="relative shrink-0">
          <button
            type="button"
            title="Daftar papan kerja (Tab / Shift+Tab untuk pindah cepat)"
            onClick={() => {
              closeToolsMenu();
              setBoardMenuOpen((v) => !v);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-2 py-1 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
          >
            <span className="font-mono-tabular">{activeBoardLabel}</span>
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>

          {boardMenuOpen && (
            <div className="absolute left-0 mt-1.5 w-64 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-sm p-2 z-50">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#E2E8F0] mb-1">
                <span className="text-xs font-semibold text-[#0F172A]">Daftar Papan Kerja</span>
                <button
                  type="button"
                  title="Buat papan kerja baru (N)"
                  onClick={() => {
                    setBoardMenuOpen(false);
                    createNewBoard('');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:text-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] rounded px-1"
                >
                  <FolderPlus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>Baru (N)</span>
                </button>
              </div>
              <ul className="max-h-56 overflow-y-auto space-y-0.5">
                {boards.map((b, idx) => {
                  const isActive = b.id === activeBoardId;
                  const canDelete = boards.length > 1;
                  return (
                    <li
                      key={b.id}
                      className={`group flex items-center gap-1 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-[#DBEAFE] text-[#1D4ED8]'
                          : 'text-[#0F172A] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setBoardMenuOpen(false);
                          if (!isActive) selectBoard(b.id);
                        }}
                        className={`flex-1 min-w-0 flex items-center gap-2 text-left pl-2.5 pr-1 py-2 text-xs ${
                          isActive ? 'font-semibold' : ''
                        }`}
                      >
                        <span className="font-mono-tabular text-[11px] opacity-70 shrink-0">
                          {idx + 1}.
                        </span>
                        <span className="truncate">{b.title}</span>
                      </button>
                      <button
                        type="button"
                        disabled={!canDelete}
                        aria-label={`Hapus papan ${b.title}`}
                        title={canDelete ? `Hapus papan "${b.title}"` : 'Minimal 1 papan harus tersedia'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setBoardMenuOpen(false);
                          setBoardPendingDelete({ id: b.id, title: b.title });
                        }}
                        className="mr-1 p-1.5 rounded-md text-[#475569] hover:bg-[#FEE2E2] hover:text-[#B91C1C] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#475569] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Save Status */}
        <div className="hidden lg:flex items-center gap-1 text-[11px] shrink-0">
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

      {/* Center: Editable Page / Board Title */}
      <div className="flex items-center justify-center min-w-0">
        <label htmlFor="board-title-input" className="sr-only">
          Judul papan kerja
        </label>
        <div
          title="Klik untuk mengubah nama halaman"
          className="group inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#CBD5E1] hover:bg-[#F1F5F9] focus-within:border-[var(--brand-primary)] focus-within:ring-2 focus-within:ring-[#1D4ED8]/20 px-2.5 py-1 transition-colors max-w-[160px] sm:max-w-[240px] md:max-w-[300px]"
        >
          <div className="relative inline-grid items-center min-w-0 overflow-hidden">
            <span
              aria-hidden="true"
              className="col-start-1 row-start-1 invisible whitespace-pre px-0.5 text-xs sm:text-sm font-semibold min-w-[3.5rem] truncate"
            >
              {boardTitle || 'Tanpa Judul'}
            </span>
            <input
              id="board-title-input"
              type="text"
              value={boardTitle}
              placeholder="Tanpa Judul"
              onChange={(e) => renameBoard(e.target.value)}
              className="col-start-1 row-start-1 w-full min-w-0 bg-transparent px-0.5 text-center text-xs sm:text-sm font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none truncate"
            />
          </div>
          <label
            htmlFor="board-title-input"
            title="Ubah nama halaman"
            className="cursor-text text-[#475569] group-hover:text-[var(--brand-primary)] group-focus-within:text-[var(--brand-primary)] transition-colors shrink-0"
          >
            <Pencil className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          </label>
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center justify-end gap-1.5 shrink-0">
        {/* Clean vs Sketch Mode Switch */}
        <div
          role="group"
          aria-label="Mode tampilan gambar"
          className="hidden md:inline-flex items-center p-0.5 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9]"
        >
          <button
            type="button"
            onClick={() => updateSettings({ renderMode: 'clean' })}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
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
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              renderMode === 'sketch'
                ? 'bg-[#FFFFFF] text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <PenTool className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span>Sketsa</span>
          </button>
        </div>

        {/* Unified Diagram Menu (PlantText + Export/Import) — opens on hover or click */}
        <div
          ref={toolsMenuRef}
          className="relative"
          onMouseEnter={handleToolsMouseEnter}
          onMouseLeave={handleToolsMouseLeave}
        >
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={toolsMenuOpen}
            aria-label="Menu PlantText dan Ekspor Impor"
            onClick={() => {
              cancelToolsCloseTimer();
              setBoardMenuOpen(false);
              if (toolsMenuPinned) {
                setToolsMenuPinned(false);
                setToolsMenuHover(false);
              } else {
                setToolsMenuPinned(true);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
          >
            <Menu className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span className="hidden sm:inline">Menu</span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-150 ${toolsMenuOpen ? 'rotate-180' : ''}`}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>

          {toolsMenuOpen && (
            <div className="absolute right-0 top-full pt-1.5 z-50">
              <div
                role="menu"
                aria-label="Menu diagram"
                className="w-56 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-1.5 shadow-sm space-y-0.5"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeToolsMenu();
                    onOpenPlantText();
                  }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-[#0F172A] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
                >
                  <div className="h-7 w-7 rounded-md bg-[#DBEAFE] text-[#1D4ED8] flex items-center justify-center shrink-0">
                    <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[#0F172A]">PlantText</div>
                    <div className="text-[11px] text-[#475569] truncate">Generate dari kode UML</div>
                  </div>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeToolsMenu();
                    onOpenExport();
                  }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-[#0F172A] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
                >
                  <div className="h-7 w-7 rounded-md bg-[#DBEAFE] text-[#1D4ED8] flex items-center justify-center shrink-0">
                    <Download className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[#0F172A]">Ekspor / Impor</span>
                      <span className="rounded bg-[#F1F5F9] px-1 py-0.5 text-[10px] font-mono-tabular text-[#475569] leading-none">
                        Ctrl+S
                      </span>
                    </div>
                    <div className="text-[11px] text-[#475569] truncate">PNG, SVG, atau JSON</div>
                  </div>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeToolsMenu();
                    onOpenAiIntegration();
                  }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-[#0F172A] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
                >
                  <div className="h-7 w-7 rounded-md bg-[#DBEAFE] text-[#1D4ED8] flex items-center justify-center shrink-0">
                    <Bot className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[#0F172A]">Integrasi AI & MCP</div>
                    <div className="text-[11px] text-[#475569] truncate">Claude, ChatGPT, Cursor</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Theme Switch (Light / Dark) */}
        <button
          type="button"
          onClick={(e) => toggleTheme(e)}
          aria-label={theme === 'dark' ? 'Aktifkan tema terang' : 'Aktifkan tema gelap'}
          aria-pressed={theme === 'dark'}
          title={theme === 'dark' ? 'Ganti ke Tema Terang' : 'Ganti ke Tema Gelap'}
          className="inline-flex items-center justify-center p-1.5 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
        >
          {theme === 'dark' ? (
            <Sun className="h-3.5 w-3.5 text-[#FBBF24]" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Moon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>

        {user ? (
          <div className="hidden sm:flex items-center gap-1.5 pl-1.5 border-l border-[#E2E8F0]">
            <span className="text-xs font-medium text-[#475569] max-w-24 truncate" title={user.email}>
              {user.name}
            </span>
            <button
              type="button"
              onClick={() => logout()}
              aria-label="Keluar akun"
              title="Keluar akun"
              className="p-1.5 rounded-lg text-[#475569] hover:bg-[#FEE2E2] hover:text-[#B91C1C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        ) : guestPreviewMode ? (
          <button
            type="button"
            onClick={() => enterAuthFromGuest()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#1D4ED8] bg-[#DBEAFE] px-2.5 py-1.5 text-xs font-medium text-[#1D4ED8] hover:bg-[#BFDBFE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
          >
            <LogIn className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span>Masuk & Simpan</span>
          </button>
        ) : null}
      </div>
    </header>

    {boardPendingDelete && (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-board-modal-title"
        onClick={() => {
          if (!deletingBoard) setBoardPendingDelete(null);
        }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-[#FEE2E2] text-[#B91C1C] flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4.5 w-4.5" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div>
                <h2 id="delete-board-modal-title" className="text-sm font-semibold text-[#0F172A]">
                  Hapus Papan Kerja?
                </h2>
                <p className="mt-1 text-xs text-[#475569] leading-relaxed">
                  Apakah Anda yakin ingin menghapus papan{' '}
                  <strong className="font-semibold text-[#0F172A]">
                    &ldquo;{boardPendingDelete.title}&rdquo;
                  </strong>
                  ? Semua komponen di dalamnya akan dihapus permanen.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={deletingBoard}
              onClick={() => setBoardPendingDelete(null)}
              aria-label="Tutup konfirmasi hapus"
              className="p-1 rounded-lg text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-40"
            >
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={deletingBoard}
              onClick={() => setBoardPendingDelete(null)}
              className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-40"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={deletingBoard}
              onClick={handleConfirmDeleteBoard}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC2626] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#B91C1C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] disabled:opacity-50"
            >
              {deletingBoard ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              )}
              <span>{deletingBoard ? 'Menghapus...' : 'Ya, Hapus'}</span>
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
