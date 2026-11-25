import { useState } from 'react';
import { Bot, Code2, Layers, Pencil } from 'lucide-react';
import { STARTER_TEMPLATES } from '../constants/templates.js';
import { useBoardStore } from '../store/useBoardStore.js';

/**
 * @param {{ onOpenPlantText: () => void, onOpenAiIntegration: () => void }} props
 */
export function EmptyCanvasOverlay({ onOpenPlantText, onOpenAiIntegration }) {
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const elementsCount = useBoardStore((s) => s.elements.length);
  const applyTemplate = useBoardStore((s) => s.applyTemplate);
  const setActiveTool = useBoardStore((s) => s.setActiveTool);
  const [dismissedForBoardId, setDismissedForBoardId] = useState(
    /** @type {string | null | undefined} */ (undefined),
  );

  if (elementsCount > 0 || dismissedForBoardId === activeBoardId) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 z-10">
      <div className="pointer-events-auto max-w-xl w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF]/95 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-[#F1F5F9] text-[#1D4ED8] flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">Papan kerja masih kosong</h2>
            <p className="text-xs text-[#475569] mt-1 leading-relaxed">
              Seret komponen DFD, ERD, UML, atau Flowchart dari panel kiri, gunakan pena bebas di toolbar atas, atau mulai dari template di bawah.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
          {STARTER_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => applyTemplate(tpl.build(), tpl.title)}
              className="text-left rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 hover:border-[#1D4ED8] hover:bg-[#DBEAFE]/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
            >
              <div className="text-xs font-semibold text-[#0F172A]">{tpl.title}</div>
              <div className="text-[11px] text-[#475569] mt-0.5 leading-snug">{tpl.description}</div>
            </button>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenPlantText}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9]"
            >
              <Code2 className="h-3.5 w-3.5 text-[#1D4ED8]" strokeWidth={1.75} aria-hidden="true" />
              <span>Tempel Kode PlantText</span>
            </button>
            <button
              type="button"
              onClick={onOpenAiIntegration}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9]"
            >
              <Bot className="h-3.5 w-3.5 text-[#1D4ED8]" strokeWidth={1.75} aria-hidden="true" />
              <span>Integrasi AI & MCP</span>
              <span className="rounded-full bg-[#FEE2E2] px-1.5 py-0.5 text-[10px] font-semibold text-[#B91C1C] leading-none shrink-0">
                <span className="animate-hot-blink">Hot</span>
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTool('pen');
              setDismissedForBoardId(activeBoardId);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1E40AF]"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span>Mulai Coret Bebas</span>
          </button>
        </div>
      </div>
    </div>
  );
}
