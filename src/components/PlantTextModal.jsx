import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Code2, Sparkles, X } from 'lucide-react';
import { computeSceneBounds } from '../engine/exporter.js';
import {
  PLANTTEXT_EXAMPLES,
  PLANT_KIND_LABELS,
  parsePlantText,
} from '../engine/plantTextParser.js';
import { useBoardStore } from '../store/useBoardStore.js';

/**
 * @param {{ open: boolean, onClose: () => void }} props
 */
export function PlantTextModal({ open, onClose }) {
  const [code, setCode] = useState(PLANTTEXT_EXAMPLES[0].code);
  const [kind, setKind] = useState(
    /** @type {import('../engine/plantTextParser.js').PlantDiagramKind} */ ('auto'),
  );
  const [placement, setPlacement] = useState(/** @type {'replace' | 'append'} */ ('replace'));
  const [submitError, setSubmitError] = useState('');

  const renderMode = useBoardStore((s) => s.settings.renderMode);
  const existingElements = useBoardStore((s) => s.elements);
  const insertGeneratedDiagram = useBoardStore((s) => s.insertGeneratedDiagram);

  const preview = useMemo(
    () => (open ? parsePlantText(code, { kind, renderMode }) : null),
    [open, code, kind, renderMode],
  );

  if (!open) return null;

  function handleGenerate() {
    setSubmitError('');
    const result = parsePlantText(code, { kind, renderMode });
    if (result.ok === false) {
      setSubmitError(result.error);
      return;
    }

    let finalElements = result.elements;
    if (placement === 'append' && existingElements.length > 0) {
      const existingBounds = computeSceneBounds(existingElements);
      const offsetX = Math.round(existingBounds.x + existingBounds.width + 60);
      finalElements = result.elements.map((el) => ({
        ...el,
        x: el.x + offsetX,
      }));
    }

    insertGeneratedDiagram(finalElements, {
      mode: placement,
      label: result.kindLabel,
    });
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="planttext-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4"
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[#DBEAFE] text-[#1D4ED8] flex items-center justify-center shrink-0">
              <Code2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <h2 id="planttext-modal-title" className="text-sm font-semibold text-[#0F172A]">
                Generate Diagram dari PlantText / PlantUML
              </h2>
              <p className="text-xs text-[#475569]">
                Tempel kode PlantText untuk membuat komponen standar perancangan yang dapat langsung diedit di kanvas.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog PlantText"
            className="p-1.5 rounded-lg text-[#475569] hover:bg-[#F1F5F9]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Controls Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="plant-kind-select" className="block font-medium text-[#475569] mb-1">
                Standar Simbol Diagram
              </label>
              <select
                id="plant-kind-select"
                value={kind}
                onChange={(e) => {
                  setKind(/** @type {any} */ (e.target.value));
                  setSubmitError('');
                }}
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-2.5 py-2 text-xs text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
              >
                <option value="auto">Deteksi Otomatis dari Kode</option>
                {Object.entries(PLANT_KIND_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block font-medium text-[#475569] mb-1">Penempatan di Kanvas</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPlacement('replace')}
                  className={`py-2 px-2 rounded-lg border font-medium transition-colors ${
                    placement === 'replace'
                      ? 'border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]'
                      : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]'
                  }`}
                >
                  Ganti Isi Papan
                </button>
                <button
                  type="button"
                  onClick={() => setPlacement('append')}
                  className={`py-2 px-2 rounded-lg border font-medium transition-colors ${
                    placement === 'append'
                      ? 'border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]'
                      : 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]'
                  }`}
                >
                  Tambahkan ke Papan
                </button>
              </div>
            </div>
          </div>

          {/* Preset Examples */}
          <div>
            <span className="block font-medium text-[#475569] mb-1.5">Contoh Kode Cepat</span>
            <div className="flex flex-wrap gap-1.5">
              {PLANTTEXT_EXAMPLES.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => {
                    setCode(ex.code);
                    setKind('auto');
                    setSubmitError('');
                  }}
                  className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 text-xs font-medium text-[#0F172A] hover:border-[#1D4ED8] hover:bg-[#DBEAFE]/40 transition-colors"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          {/* Code Editor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="planttext-code-input" className="font-medium text-[#475569]">
                Kode PlantText / PlantUML
              </label>
              <button
                type="button"
                onClick={() => {
                  setCode('');
                  setSubmitError('');
                }}
                className="text-[11px] text-[#475569] hover:text-[#B91C1C]"
              >
                Bersihkan
              </button>
            </div>
            <textarea
              id="planttext-code-input"
              rows={11}
              spellCheck={false}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setSubmitError('');
              }}
              placeholder="@startuml&#10;entity users {&#10;  * id : UUID <<PK>>&#10;}&#10;@enduml"
              className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-xs font-mono-tabular text-[#0F172A] leading-relaxed focus:bg-[#FFFFFF] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 resize-y"
            />
          </div>

          {/* Live Detection / Error Status */}
          {submitError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-[#B91C1C]/30 bg-[#FEE2E2] px-3 py-2 text-xs text-[#B91C1C]"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          ) : preview && preview.ok ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[#15803D]/30 bg-[#DCFCE7] px-3 py-2 text-xs text-[#15803D]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  Terdeteksi: <strong>{preview.kindLabel}</strong>
                </span>
              </div>
              <span className="font-mono-tabular">
                {preview.summary.nodes} komponen, {preview.summary.connectors} konektor
              </span>
            </div>
          ) : preview && preview.ok === false ? (
            <div className="flex items-start gap-2 rounded-lg border border-[#B45309]/30 bg-[#FEF3C7] px-3 py-2 text-xs text-[#B45309]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
              <span>{preview.error}</span>
            </div>
          ) : null}
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-3.5 py-2 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9]"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!preview || !preview.ok}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span>Generate ke Kanvas</span>
          </button>
        </div>
      </div>
    </div>
  );
}
