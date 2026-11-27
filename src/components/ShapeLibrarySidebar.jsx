import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from 'lucide-react';
import {
  CONNECTOR_PRESETS,
  SHAPE_CATEGORIES,
  SHAPE_DEFINITIONS,
  createConnectorFromPreset,
  createElementFromShape,
} from '../engine/shapeRegistry.js';
import { STARTER_TEMPLATES } from '../constants/templates.js';
import { useBoardStore } from '../store/useBoardStore.js';

/**
 * Render declarative SVG preview thumbnail for a shape definition.
 * @param {{ preview: import('../engine/shapeRegistry.js').PreviewPrimitive[], className?: string }} props
 */
export function ShapePreviewIcon({ preview, className = 'w-9 h-7 shrink-0' }) {
  return (
    <svg
      viewBox="0 0 40 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {preview.map((item, idx) => {
        if (item.kind === 'rect') return <rect key={idx} {...item.props} />;
        if (item.kind === 'ellipse') return <ellipse key={idx} {...item.props} />;
        if (item.kind === 'circle') return <circle key={idx} {...item.props} />;
        if (item.kind === 'line') return <line key={idx} {...item.props} />;
        if (item.kind === 'polygon') return <polygon key={idx} {...item.props} />;
        if (item.kind === 'path') return <path key={idx} {...item.props} />;
        return null;
      })}
    </svg>
  );
}

/**
 * @param {{ open: boolean, onToggle: () => void }} props
 */
export function ShapeLibrarySidebar({ open, onToggle }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => ({
    basic: true,
    connectors: true,
    rich_picture: true,
    flowchart: false,
    bpmn: false,
    dfd: true,
    erd: true,
    uml: false,
    arch: false,
  }));

  const activeTool = useBoardStore((s) => s.activeTool);
  const renderMode = useBoardStore((s) => s.settings.renderMode);
  const defaultStrokeColor = useBoardStore((s) => s.defaultStrokeColor);
  const camera = useBoardStore((s) => s.camera);
  const setActiveTool = useBoardStore((s) => s.setActiveTool);
  const addElement = useBoardStore((s) => s.addElement);
  const applyTemplate = useBoardStore((s) => s.applyTemplate);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredConnectors = useMemo(() => {
    if (!normalizedQuery) return CONNECTOR_PRESETS;
    return CONNECTOR_PRESETS.filter(
      (preset) =>
        preset.label.toLowerCase().includes(normalizedQuery) ||
        preset.keywords.some((k) => k.toLowerCase().includes(normalizedQuery)),
    );
  }, [normalizedQuery]);

  const grouped = useMemo(() => {
    /** @type {Array<{ id: string, label: string, kind: 'shape' | 'connector', items: any[] }>} */
    const groups = SHAPE_CATEGORIES.map((cat) => {
      const items = SHAPE_DEFINITIONS.filter((def) => {
        if (def.category !== cat.id) return false;
        if (!normalizedQuery) return true;
        return (
          def.label.toLowerCase().includes(normalizedQuery) ||
          def.keywords.some((k) => k.toLowerCase().includes(normalizedQuery))
        );
      });
      return { ...cat, kind: /** @type {const} */ ('shape'), items };
    }).filter((group) => group.items.length > 0);

    if (filteredConnectors.length > 0) {
      const connectorGroup = {
        id: 'connectors',
        label: 'Garis & Penghubung',
        kind: /** @type {const} */ ('connector'),
        items: filteredConnectors,
      };
      const basicIdx = groups.findIndex((g) => g.id === 'basic');
      groups.splice(basicIdx >= 0 ? basicIdx + 1 : 0, 0, connectorGroup);
    }

    return groups;
  }, [normalizedQuery, filteredConnectors]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Buka Komponen Diagram ([)"
        aria-label="Buka pustaka bentuk diagram ([)"
        className="fixed left-3 top-14 z-20 inline-flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-2 text-xs font-medium text-[#0F172A] shadow-sm hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
      >
        <PanelLeftOpen className="h-4 w-4 text-[#475569]" strokeWidth={1.75} aria-hidden="true" />
      </button>
    );
  }

  /**
   * Insert shape near center of current viewport when user clicks an item.
   * @param {string} type
   */
  function handleQuickInsert(type) {
    const cx = (window.innerWidth * 0.45 - camera.x) / camera.zoom;
    const cy = (window.innerHeight * 0.45 - camera.y) / camera.zoom;
    const jitter = (Math.random() - 0.5) * 32;
    const el = createElementFromShape(type, cx + jitter, cy + jitter, { renderMode });
    addElement(el);
    setActiveTool('select');
  }

  /**
   * Insert a connector preset near center of current viewport when user clicks an item.
   * @param {string} presetId
   */
  function handleQuickInsertConnector(presetId) {
    const cx = (window.innerWidth * 0.45 - camera.x) / camera.zoom;
    const cy = (window.innerHeight * 0.45 - camera.y) / camera.zoom;
    const jitter = (Math.random() - 0.5) * 32;
    const el = createConnectorFromPreset(presetId, cx + jitter, cy + jitter, {
      renderMode,
      strokeColor: defaultStrokeColor,
    });
    addElement(el);
    setActiveTool('select');
  }

  return (
    <aside
      aria-label="Pustaka bentuk diagram"
      className="w-64 shrink-0 bg-[#FFFFFF] border-r border-[#E2E8F0] flex flex-col h-full z-20 max-md:fixed max-md:left-0 max-md:top-12 max-md:bottom-0 max-md:shadow-sm"
    >
      <div className="p-3 border-b border-[#E2E8F0] space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#475569]">
            Komponen Diagram
          </h2>
          <button
            type="button"
            onClick={onToggle}
            title="Tutup Komponen Diagram ([)"
            aria-label="Tutup panel komponen ([)"
            className="inline-flex items-center justify-center p-1 rounded-md text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
          >
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="relative">
          <Search
            className="h-3.5 w-3.5 text-[#475569] absolute left-2.5 top-1/2 -translate-y-1/2"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <label htmlFor="shape-search" className="sr-only">
            Cari bentuk DFD, ERD, UML, Flowchart
          </label>
          <input
            id="shape-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari Rich Picture, BPMN, DFD, ERD, UML..."
            className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-8 pr-3 py-1.5 text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-[#FFFFFF] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
          />
        </div>
        <p className="text-[11px] text-[#475569]">
          Klik untuk menambah atau seret ke kanvas.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {grouped.length === 0 ? (
          <div className="py-8 px-3 text-center">
            <p className="text-xs font-medium text-[#0F172A]">Komponen tidak ditemukan</p>
            <p className="text-[11px] text-[#475569] mt-1">
              Coba kata kunci seperti DFD, ERD, UML, tabel, atau proses.
            </p>
          </div>
        ) : (
          grouped.map((group) => {
            const isOpen = normalizedQuery.length > 0 || Boolean(expanded[group.id]);
            return (
              <section key={group.id} className="border border-[#E2E8F0] rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [group.id]: !prev[group.id] }))
                  }
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between px-2.5 py-2 bg-[#F8FAFC] hover:bg-[#F1F5F9] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D4ED8]"
                >
                  <span className="text-xs font-semibold text-[#0F172A]">{group.label}</span>
                  <div className="flex items-center gap-1 text-[#475569]">
                    <span className="text-[11px] font-mono-tabular">{group.items.length}</span>
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="grid grid-cols-2 gap-1.5 p-2 bg-[#FFFFFF]">
                    {group.kind === 'connector'
                      ? group.items.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/x-flowboard-connector', preset.id);
                              e.dataTransfer.effectAllowed = 'copy';
                            }}
                            onClick={() => handleQuickInsertConnector(preset.id)}
                            title={`${preset.label} — klik atau seret ke kanvas`}
                            className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] text-[#0F172A] hover:bg-[#F1F5F9] hover:border-[#CBD5E1] text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
                          >
                            <ShapePreviewIcon preview={preset.preview} />
                            <span className="text-[11px] leading-tight text-[#475569] line-clamp-2">
                              {preset.label}
                            </span>
                          </button>
                        ))
                      : group.items.map((shape) => (
                          <button
                            key={shape.type}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/x-flowboard-shape', shape.type);
                              e.dataTransfer.effectAllowed = 'copy';
                            }}
                            onClick={() => handleQuickInsert(shape.type)}
                            title={`${shape.label} — klik atau seret ke kanvas`}
                            className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
                              activeTool === shape.type
                                ? 'border-[#1D4ED8] bg-[#DBEAFE]/40 text-[#1D4ED8]'
                                : 'border-[#E2E8F0] bg-[#FFFFFF] text-[#0F172A] hover:bg-[#F1F5F9] hover:border-[#CBD5E1]'
                            }`}
                          >
                            <ShapePreviewIcon preview={shape.preview} />
                            <span className="text-[11px] leading-tight text-[#475569] line-clamp-2">
                              {shape.label}
                            </span>
                          </button>
                        ))}
                  </div>
                )}
              </section>
            );
          })
        )}

        {/* Templates section */}
        <section className="pt-2 border-t border-[#E2E8F0]">
          <div className="flex items-center gap-1.5 px-1 mb-2">
            <LayoutTemplate className="h-3.5 w-3.5 text-[#475569]" strokeWidth={1.75} aria-hidden="true" />
            <h3 className="text-xs font-semibold text-[#475569]">Template Cepat</h3>
          </div>
          <div className="space-y-1.5">
            {STARTER_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyTemplate(tpl.build(), tpl.title)}
                className="w-full text-left p-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
              >
                <div className="text-xs font-medium text-[#0F172A]">{tpl.title}</div>
                <div className="text-[11px] text-[#475569] mt-0.5 leading-snug">
                  {tpl.description}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
