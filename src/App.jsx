import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { AuthScreen } from './components/AuthScreen.jsx';
import { EmptyCanvasOverlay } from './components/EmptyCanvasOverlay.jsx';
import { ExportImportModal } from './components/ExportImportModal.jsx';
import { FeedbackBanner } from './components/FeedbackBanner.jsx';
import { HeaderBar } from './components/HeaderBar.jsx';
import { InspectorPanel } from './components/InspectorPanel.jsx';
import { PlantTextModal } from './components/PlantTextModal.jsx';
import { ShapeLibrarySidebar } from './components/ShapeLibrarySidebar.jsx';
import { TopToolbar } from './components/TopToolbar.jsx';
import { WhiteboardCanvas } from './components/WhiteboardCanvas.jsx';
import { ZoomStatusBar } from './components/ZoomStatusBar.jsx';
import { useBoardStore } from './store/useBoardStore.js';

export function App() {
  const [leftOpen, setLeftOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  );
  const [rightOpen, setRightOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [plantTextOpen, setPlantTextOpen] = useState(false);

  const authStatus = useBoardStore((s) => s.authStatus);
  const boardLoadState = useBoardStore((s) => s.boardLoadState);
  const boardLoadError = useBoardStore((s) => s.boardLoadError);
  const bootstrapAuth = useBoardStore((s) => s.bootstrapAuth);
  const loadBoards = useBoardStore((s) => s.loadBoards);

  useEffect(() => {
    bootstrapAuth();
  }, [bootstrapAuth]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return undefined;

    /** @param {KeyboardEvent} e */
    function handleAppShortcuts(e) {
      const mod = e.ctrlKey || e.metaKey;

      // Ctrl+S / Cmd+S: prevent browser Save Page dialog, save board to server, and open Export/Download dialog
      if (mod && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        useBoardStore.getState().saveActiveBoard();
        setPlantTextOpen(false);
        setExportOpen(true);
        return;
      }

      const tag = /** @type {HTMLElement | null} */ (e.target)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (mod || e.altKey) return;

      if (e.key === '[') {
        e.preventDefault();
        setLeftOpen((v) => !v);
      } else if (e.key === ']') {
        e.preventDefault();
        setRightOpen((v) => !v);
      } else if (e.key === '\\') {
        e.preventDefault();
        setLeftOpen((prevLeft) => {
          const next = !prevLeft;
          setRightOpen(next);
          return next;
        });
      }
    }

    window.addEventListener('keydown', handleAppShortcuts);
    return () => window.removeEventListener('keydown', handleAppShortcuts);
  }, [authStatus]);

  if (authStatus === 'loading') {
    return (
      <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center gap-3 p-4">
        <Loader2 className="h-7 w-7 animate-spin text-[#1D4ED8]" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-medium text-[#475569]">Memeriksa sesi akun...</p>
      </main>
    );
  }

  if (authStatus === 'unauthenticated') {
    return <AuthScreen />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#F8FAFC]">
      <HeaderBar
        onOpenExport={() => setExportOpen(true)}
        onOpenPlantText={() => setPlantTextOpen(true)}
      />

      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        <ShapeLibrarySidebar open={leftOpen} onToggle={() => setLeftOpen((v) => !v)} />

        <main className="flex-1 min-w-0 relative flex flex-col overflow-hidden">
          {boardLoadState === 'loading' ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
              <Loader2 className="h-6 w-6 animate-spin text-[#1D4ED8]" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm text-[#475569]">Memuat papan kerja...</p>
            </div>
          ) : boardLoadState === 'error' ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div
                role="alert"
                className="max-w-sm w-full rounded-xl border border-[#B91C1C]/30 bg-[#FFFFFF] p-5 text-center space-y-3"
              >
                <div className="mx-auto h-10 w-10 rounded-full bg-[#FEE2E2] text-[#B91C1C] flex items-center justify-center">
                  <AlertCircle className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <h2 className="text-sm font-semibold text-[#0F172A]">Gagal Memuat Papan Kerja</h2>
                <p className="text-xs text-[#475569]">{boardLoadError}</p>
                <button
                  type="button"
                  onClick={() => loadBoards()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1E40AF]"
                >
                  <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>Coba Lagi</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <TopToolbar />
              <WhiteboardCanvas />
              <EmptyCanvasOverlay onOpenPlantText={() => setPlantTextOpen(true)} />
              <ZoomStatusBar />
            </>
          )}
        </main>

        <InspectorPanel open={rightOpen} onToggle={() => setRightOpen((v) => !v)} />
      </div>

      <ExportImportModal open={exportOpen} onClose={() => setExportOpen(false)} />
      <PlantTextModal open={plantTextOpen} onClose={() => setPlantTextOpen(false)} />
      <FeedbackBanner />
    </div>
  );
}

export default App;
