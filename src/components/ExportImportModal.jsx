import { useRef, useState } from 'react';
import { AlertCircle, FileCode2, FileJson, Image, Loader2, Upload, X } from 'lucide-react';
import { MAX_IMPORT_FILE_BYTES } from '../types/schema.js';
import {
  exportToPngBlob,
  exportToSvgString,
  parseAndValidateBoardJson,
  serializeBoardToJson,
} from '../engine/exporter.js';
import { useBoardStore } from '../store/useBoardStore.js';

/**
 * Trigger browser file download for a Blob.
 * @param {Blob} blob
 * @param {string} filename
 */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {{ open: boolean, onClose: () => void }} props
 */
export function ExportImportModal({ open, onClose }) {
  const fileInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [transparentBg, setTransparentBg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const boardTitle = useBoardStore((s) => s.boardTitle);
  const settings = useBoardStore((s) => s.settings);
  const elements = useBoardStore((s) => s.elements);
  const importDocument = useBoardStore((s) => s.importDocument);
  const setFeedback = useBoardStore((s) => s.setFeedback);

  if (!open) return null;

  const safeSlug =
    boardTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'diagram-flowboard';

  async function handleExportPng() {
    setError('');
    setBusy(true);
    try {
      const blob = await exportToPngBlob(elements, {
        background: transparentBg ? 'transparent' : '#FFFFFF',
        scale: 2,
      });
      triggerDownload(blob, `${safeSlug}.png`);
      setFeedback({ type: 'success', message: 'Diagram berhasil diekspor ke PNG.' });
    } catch (err) {
      setError(err?.message || 'Gagal mengekspor PNG.');
    } finally {
      setBusy(false);
    }
  }

  function handleExportSvg() {
    setError('');
    try {
      const svg = exportToSvgString(elements, {
        background: transparentBg ? 'transparent' : '#FFFFFF',
      });
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      triggerDownload(blob, `${safeSlug}.svg`);
      setFeedback({ type: 'success', message: 'Diagram berhasil diekspor ke SVG.' });
    } catch (err) {
      setError(err?.message || 'Gagal mengekspor SVG.');
    }
  }

  function handleExportJson() {
    setError('');
    const json = serializeBoardToJson({ title: boardTitle, settings, elements });
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    triggerDownload(blob, `${safeSlug}.flowboard.json`);
    setFeedback({ type: 'success', message: 'Berkas proyek JSON berhasil diunduh.' });
  }

  /** @param {import('react').ChangeEvent<HTMLInputElement>} e */
  async function handleFileSelect(e) {
    setError('');
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json')) {
      setError('Hanya berkas berekstensi .json yang diizinkan.');
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError('Ukuran berkas melebihi batas maksimum 5 MB.');
      return;
    }

    setBusy(true);
    try {
      const text = await file.text();
      const validated = parseAndValidateBoardJson(text);
      if (validated.ok === false) {
        setError(validated.error);
        return;
      }
      importDocument(validated.data);
      onClose();
    } catch {
      setError('Gagal membaca berkas JSON yang dipilih.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
          <h2 id="export-modal-title" className="text-base font-semibold text-[#0F172A]">
            Ekspor & Impor Diagram
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="p-1 rounded-lg text-[#475569] hover:bg-[#F1F5F9]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-[#B91C1C]/30 bg-[#FEE2E2] px-3 py-2 text-xs text-[#B91C1C]"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 space-y-4">
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#475569]">
              Ekspor Papan Aktif
            </h3>

            <label className="flex items-center gap-2 text-xs text-[#0F172A] cursor-pointer">
              <input
                type="checkbox"
                checked={transparentBg}
                onChange={(e) => setTransparentBg(e.target.checked)}
                className="h-4 w-4 accent-[#1D4ED8]"
              />
              <span>Latar belakang transparan (untuk PNG & SVG)</span>
            </label>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleExportPng}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-[#E2E8F0] p-3 text-xs font-medium text-[#0F172A] hover:border-[#1D4ED8] hover:bg-[#F8FAFC] disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin text-[#1D4ED8]" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Image className="h-5 w-5 text-[#1D4ED8]" strokeWidth={1.75} aria-hidden="true" />
                )}
                <span>PNG (2x)</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={handleExportSvg}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-[#E2E8F0] p-3 text-xs font-medium text-[#0F172A] hover:border-[#1D4ED8] hover:bg-[#F8FAFC] disabled:opacity-50"
              >
                <FileCode2 className="h-5 w-5 text-[#1D4ED8]" strokeWidth={1.75} aria-hidden="true" />
                <span>SVG Vektor</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={handleExportJson}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-[#E2E8F0] p-3 text-xs font-medium text-[#0F172A] hover:border-[#1D4ED8] hover:bg-[#F8FAFC] disabled:opacity-50"
              >
                <FileJson className="h-5 w-5 text-[#1D4ED8]" strokeWidth={1.75} aria-hidden="true" />
                <span>JSON Proyek</span>
              </button>
            </div>
          </section>

          <section className="pt-3 border-t border-[#E2E8F0] space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#475569]">
              Impor Berkas FlowBoard (.json)
            </h3>
            <p className="text-xs text-[#475569]">
              Impor akan menggantikan isi papan kerja aktif setelah lolos validasi struktur (maks. 5 MB).
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-50"
            >
              <Upload className="h-4 w-4 text-[#475569]" strokeWidth={1.75} aria-hidden="true" />
              <span>Pilih Berkas JSON</span>
            </button>
          </section>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#F1F5F9] px-3 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#E2E8F0]"
          >
            <span>Tutup</span>
          </button>
        </div>
      </div>
    </div>
  );
}
