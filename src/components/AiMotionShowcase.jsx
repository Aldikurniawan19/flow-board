import { useState } from 'react';
import { Link2, Pause, Play, Plug, RotateCcw } from 'lucide-react';

const SCENES = [
  {
    id: /** @type {const} */ ('mcp'),
    label: '1. Koneksi MCP',
    shortLabel: 'MCP Server',
    caption: 'AI Agent (Claude, Cursor, Antigravity) langsung membuat & menyimpan diagram ke akun Anda.',
    icon: Plug,
  },
  {
    id: /** @type {const} */ ('deeplink'),
    label: '2. Tautan AI',
    shortLabel: 'Deep-Link',
    caption: 'Cukup klik tautan dari ChatGPT/Gemini — diagram langsung terakit rapi di kanvas FlowBoard.',
    icon: Link2,
  },
];

/**
 * Interactive 2-scene SVG/CSS motion-video showcase inside the FlowBoard Pro upgrade modal.
 * Illustrates (1) Remote MCP Server live beam -> DFD generation and (2) AI Deep-Link click -> Peter Chen ERD assembly.
 */
export function AiMotionShowcase() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [replayKey, setReplayKey] = useState(0);

  const activeScene = SCENES[sceneIdx];

  function handleSceneSelect(idx) {
    setSceneIdx(idx);
    setReplayKey((k) => k + 1);
    setPlaying(true);
  }

  function handleAdvanceScene() {
    if (!playing) return;
    setSceneIdx((prev) => (prev + 1) % SCENES.length);
    setReplayKey((k) => k + 1);
  }

  return (
    <div
      className={`fb-motion-stage rounded-xl border border-[#334155]/70 bg-[#0B1120] overflow-hidden select-none ${
        playing ? '' : 'is-paused'
      }`}
      aria-label="Animasi demo cara kerja Integrasi AI dan MCP FlowBoard"
    >
      {/* Top Cinema Control Bar */}
      <div className="px-3 py-2 border-b border-[#1E293B] bg-[#0F172A]/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]/80" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]/80" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]/80" aria-hidden="true" />
          <span className="ml-1.5 text-[10px] font-mono-tabular uppercase tracking-wider text-[#94A3B8]">
            Demo Motion
          </span>
        </div>

        <div className="flex items-center gap-1">
          {SCENES.map((scene, idx) => {
            const Icon = scene.icon;
            const isActive = idx === sceneIdx;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => handleSceneSelect(idx)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                  isActive
                    ? 'bg-[#2563EB] text-white'
                    : 'bg-[#1E293B] text-[#94A3B8] hover:text-white'
                }`}
              >
                <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                <span>{scene.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Jeda animasi demo' : 'Putar animasi demo'}
            title={playing ? 'Jeda animasi' : 'Putar animasi'}
            className="ml-1 p-1 rounded-md bg-[#1E293B] text-[#CBD5E1] hover:text-white"
          >
            {playing ? (
              <Pause className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            ) : (
              <Play className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setReplayKey((k) => k + 1);
              setPlaying(true);
            }}
            aria-label="Ulangi adegan animasi"
            title="Ulangi adegan"
            className="p-1 rounded-md bg-[#1E293B] text-[#CBD5E1] hover:text-white"
          >
            <RotateCcw className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main Motion Canvas */}
      <div className="relative px-2 py-2.5 bg-[radial-gradient(#1E293B_1px,transparent_1px)] [background-size:14px_14px]">
        <svg
          key={`${activeScene.id}-${replayKey}`}
          viewBox="0 0 600 236"
          className="w-full h-auto block"
          role="img"
          aria-label={activeScene.caption}
        >
          <defs>
            <linearGradient id="fb-beam-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#38BDF8" stopOpacity="1" />
              <stop offset="100%" stopColor="#60A5FA" stopOpacity="1" />
            </linearGradient>
            <linearGradient id="fb-beam-emerald" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.2" />
              <stop offset="55%" stopColor="#34D399" stopOpacity="1" />
              <stop offset="100%" stopColor="#22C55E" stopOpacity="1" />
            </linearGradient>
            <linearGradient id="fb-beam-indigo" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#818CF8" stopOpacity="0.2" />
              <stop offset="55%" stopColor="#38BDF8" stopOpacity="1" />
              <stop offset="100%" stopColor="#60A5FA" stopOpacity="1" />
            </linearGradient>
            <filter id="fb-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker
              id="fb-arrow-slate"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#94A3B8" />
            </marker>
          </defs>

          {activeScene.id === 'mcp' ? (
            /* ================= SCENE 1: REMOTE MCP SERVER -> DFD ================= */
            <g>
              {/* Left Panel: AI Agent Chat */}
              <g className="fb-m-fade" style={{ animationDelay: '0.05s' }}>
                <rect
                  x="14"
                  y="24"
                  width="156"
                  height="186"
                  rx="10"
                  fill="#0F172A"
                  stroke="#334155"
                  strokeWidth="1.2"
                />
                <rect x="14" y="24" width="156" height="24" rx="10" fill="#1E293B" />
                <rect x="14" y="38" width="156" height="10" fill="#1E293B" />
                <circle cx="27" cy="36" r="4" fill="#38BDF8" />
                <text x="37" y="39.5" fill="#E2E8F0" fontSize="9.5" fontWeight="600">
                  Claude / Cursor
                </text>

                {/* Prompt bubble */}
                <g className="fb-m-pop" style={{ animationDelay: '0.25s', transformOrigin: '92px 72px' }}>
                  <rect x="24" y="57" width="136" height="36" rx="7" fill="#1E3A8A" />
                  <text x="31" y="71" fill="#E0F2FE" fontSize="8.2" fontWeight="500">
                    &ldquo;Buatkan DFD Level 1
                  </text>
                  <text x="31" y="83" fill="#BAE6FD" fontSize="8.2">
                    sistem pengiriman barang&rdquo;
                  </text>
                </g>

                {/* Tool call pill */}
                <g className="fb-m-pop" style={{ animationDelay: '1.15s', transformOrigin: '92px 118px' }}>
                  <rect
                    x="24"
                    y="102"
                    width="136"
                    height="36"
                    rx="7"
                    fill="#111827"
                    stroke="#38BDF8"
                    strokeOpacity="0.65"
                    strokeWidth="1"
                  />
                  <circle cx="34" cy="115" r="3" fill="#38BDF8" className="fb-m-pulse" />
                  <text x="42" y="118" fill="#38BDF8" fontSize="8" fontWeight="600" fontFamily="monospace">
                    generate_diagram()
                  </text>
                  <text x="31" y="130" fill="#94A3B8" fontSize="7.4" fontFamily="monospace">
                    POST /api/mcp • fbk_•••
                  </text>
                </g>

                {/* Success reply */}
                <g className="fb-m-pop" style={{ animationDelay: '4.6s', transformOrigin: '92px 172px' }}>
                  <rect
                    x="24"
                    y="148"
                    width="136"
                    height="48"
                    rx="7"
                    fill="#052E16"
                    stroke="#22C55E"
                    strokeOpacity="0.7"
                    strokeWidth="1"
                  />
                  <text x="32" y="164" fill="#86EFAC" fontSize="8.5" fontWeight="600">
                    ✓ Papan berhasil dibuat!
                  </text>
                  <text x="32" y="177" fill="#BBF7D0" fontSize="7.5">
                    DFD Pengiriman (7 node)
                  </text>
                  <text x="32" y="188" fill="#4ADE80" fontSize="7.2" fontFamily="monospace">
                    /?board=dfd-pengiriman
                  </text>
                </g>
              </g>

              {/* Connecting Track 1: AI -> MCP Hub */}
              <path
                d="M 170 118 C 188 118, 192 118, 210 118"
                fill="none"
                stroke="#334155"
                strokeWidth="2"
                strokeDasharray="3 3"
              />
              <path
                d="M 170 118 C 188 118, 192 118, 210 118"
                fill="none"
                stroke="url(#fb-beam-cyan)"
                strokeWidth="3.2"
                strokeLinecap="round"
                filter="url(#fb-glow)"
                pathLength="100"
                className="fb-m-beam"
                style={{ animationDelay: '1.45s' }}
              />

              {/* Center Hub: MCP Server */}
              <g className="fb-m-pop" style={{ animationDelay: '0.15s', transformOrigin: '240px 118px' }}>
                <circle
                  cx="240"
                  cy="118"
                  r="33"
                  fill="none"
                  stroke="#38BDF8"
                  strokeOpacity="0.25"
                  strokeWidth="1.5"
                  className="fb-m-ring"
                  style={{ animationDelay: '1.9s', transformOrigin: '240px 118px' }}
                />
                <rect
                  x="210"
                  y="90"
                  width="60"
                  height="56"
                  rx="14"
                  fill="#0F172A"
                  stroke="#38BDF8"
                  strokeWidth="1.6"
                />
                <text x="240" y="114" textAnchor="middle" fill="#38BDF8" fontSize="11.5" fontWeight="700">
                  MCP
                </text>
                <text x="240" y="127" textAnchor="middle" fill="#94A3B8" fontSize="7.2" fontFamily="monospace">
                  Auto-Layout
                </text>
                <text x="240" y="137" textAnchor="middle" fill="#4ADE80" fontSize="6.8" fontFamily="monospace">
                  Pro Auth ✓
                </text>
              </g>

              {/* Connecting Track 2: MCP Hub -> FlowBoard Canvas */}
              <path
                d="M 270 118 C 288 118, 292 118, 312 118"
                fill="none"
                stroke="#334155"
                strokeWidth="2"
                strokeDasharray="3 3"
              />
              <path
                d="M 270 118 C 288 118, 292 118, 312 118"
                fill="none"
                stroke="url(#fb-beam-emerald)"
                strokeWidth="3.2"
                strokeLinecap="round"
                filter="url(#fb-glow)"
                pathLength="100"
                className="fb-m-beam"
                style={{ animationDelay: '2.15s' }}
              />

              {/* Right Panel: Mini FlowBoard Canvas (DFD Level 1) */}
              <g className="fb-m-fade" style={{ animationDelay: '0.1s' }}>
                <rect
                  x="312"
                  y="18"
                  width="274"
                  height="198"
                  rx="10"
                  fill="#0F172A"
                  stroke="#334155"
                  strokeWidth="1.2"
                />
                <rect x="312" y="18" width="274" height="24" rx="10" fill="#1E293B" />
                <rect x="312" y="32" width="274" height="10" fill="#1E293B" />
                <rect x="322" y="25" width="10" height="10" rx="2.5" fill="#2563EB" />
                <text x="337" y="33.5" fill="#F8FAFC" fontSize="9.2" fontWeight="600">
                  FlowBoard • DFD Level 1 Pengiriman
                </text>

                {/* External Entities (Left column) */}
                <g className="fb-m-pop" style={{ animationDelay: '2.75s', transformOrigin: '355px 80px' }}>
                  <rect x="325" y="64" width="60" height="30" rx="3" fill="#1E3A8A" stroke="#60A5FA" strokeWidth="1.2" />
                  <text x="355" y="82" textAnchor="middle" fill="#EFF6FF" fontSize="8.2" fontWeight="600">
                    Pengirim
                  </text>
                </g>
                <g className="fb-m-pop" style={{ animationDelay: '2.95s', transformOrigin: '355px 150px' }}>
                  <rect x="325" y="134" width="60" height="30" rx="3" fill="#1E3A8A" stroke="#60A5FA" strokeWidth="1.2" />
                  <text x="355" y="152" textAnchor="middle" fill="#EFF6FF" fontSize="8.2" fontWeight="600">
                    Kurir
                  </text>
                </g>

                {/* Processes (Middle column - Yourdon circles) */}
                <g className="fb-m-pop" style={{ animationDelay: '3.2s', transformOrigin: '450px 80px' }}>
                  <circle cx="450" cy="79" r="24" fill="#422006" stroke="#FBBF24" strokeWidth="1.3" />
                  <text x="450" y="76" textAnchor="middle" fill="#FDE68A" fontSize="7.6" fontWeight="700">
                    1.0
                  </text>
                  <text x="450" y="87" textAnchor="middle" fill="#FEF3C7" fontSize="7.5">
                    Order
                  </text>
                </g>
                <g className="fb-m-pop" style={{ animationDelay: '3.4s', transformOrigin: '450px 149px' }}>
                  <circle cx="450" cy="149" r="24" fill="#422006" stroke="#FBBF24" strokeWidth="1.3" />
                  <text x="450" y="146" textAnchor="middle" fill="#FDE68A" fontSize="7.6" fontWeight="700">
                    2.0
                  </text>
                  <text x="450" y="157" textAnchor="middle" fill="#FEF3C7" fontSize="7.5">
                    Kirim
                  </text>
                </g>

                {/* Data Stores (Right column) */}
                <g className="fb-m-pop" style={{ animationDelay: '3.65s', transformOrigin: '544px 80px' }}>
                  <rect x="514" y="66" width="60" height="26" fill="#064E3B" stroke="none" />
                  <line x1="514" y1="66" x2="574" y2="66" stroke="#34D399" strokeWidth="1.4" />
                  <line x1="514" y1="92" x2="574" y2="92" stroke="#34D399" strokeWidth="1.4" />
                  <text x="544" y="82" textAnchor="middle" fill="#D1FAE5" fontSize="7.8" fontWeight="600">
                    D1 Resi
                  </text>
                </g>
                <g className="fb-m-pop" style={{ animationDelay: '3.85s', transformOrigin: '544px 149px' }}>
                  <rect x="514" y="136" width="60" height="26" fill="#064E3B" stroke="none" />
                  <line x1="514" y1="136" x2="574" y2="136" stroke="#34D399" strokeWidth="1.4" />
                  <line x1="514" y1="162" x2="574" y2="162" stroke="#34D399" strokeWidth="1.4" />
                  <text x="544" y="152" textAnchor="middle" fill="#D1FAE5" fontSize="7.8" fontWeight="600">
                    D2 Track
                  </text>
                </g>

                {/* Connectors drawing cleanly */}
                <path
                  d="M 385 79 L 424 79"
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="1.3"
                  markerEnd="url(#fb-arrow-slate)"
                  pathLength="100"
                  className="fb-m-draw"
                  style={{ animationDelay: '4.0s' }}
                />
                <path
                  d="M 385 149 L 424 149"
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="1.3"
                  markerEnd="url(#fb-arrow-slate)"
                  pathLength="100"
                  className="fb-m-draw"
                  style={{ animationDelay: '4.12s' }}
                />
                <path
                  d="M 450 103 L 450 123"
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="1.3"
                  markerEnd="url(#fb-arrow-slate)"
                  pathLength="100"
                  className="fb-m-draw"
                  style={{ animationDelay: '4.22s' }}
                />
                <path
                  d="M 474 79 L 512 79"
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="1.3"
                  markerEnd="url(#fb-arrow-slate)"
                  pathLength="100"
                  className="fb-m-draw"
                  style={{ animationDelay: '4.32s' }}
                />
                <path
                  d="M 474 149 L 512 149"
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="1.3"
                  markerEnd="url(#fb-arrow-slate)"
                  pathLength="100"
                  className="fb-m-draw"
                  style={{ animationDelay: '4.42s' }}
                />

                {/* Bottom Saved Toast */}
                <g className="fb-m-pop" style={{ animationDelay: '4.75s', transformOrigin: '449px 196px' }}>
                  <rect x="366" y="185" width="166" height="21" rx="10.5" fill="#15803D" />
                  <text x="449" y="198.5" textAnchor="middle" fill="#FFFFFF" fontSize="8" fontWeight="600">
                    ✓ Tersimpan otomatis • 100% Editabel
                  </text>
                </g>
              </g>
            </g>
          ) : (
            /* ================= SCENE 2: AI DEEP-LINK CLICK -> ERD PETER CHEN ================= */
            <g>
              {/* Left Panel: ChatGPT / Gemini Chat */}
              <g className="fb-m-fade" style={{ animationDelay: '0.05s' }}>
                <rect
                  x="14"
                  y="24"
                  width="206"
                  height="186"
                  rx="10"
                  fill="#0F172A"
                  stroke="#334155"
                  strokeWidth="1.2"
                />
                <rect x="14" y="24" width="206" height="24" rx="10" fill="#1E293B" />
                <rect x="14" y="38" width="206" height="10" fill="#1E293B" />
                <circle cx="27" cy="36" r="4" fill="#818CF8" />
                <text x="37" y="39.5" fill="#E2E8F0" fontSize="9.5" fontWeight="600">
                  ChatGPT / Gemini
                </text>

                {/* User prompt */}
                <g className="fb-m-pop" style={{ animationDelay: '0.2s', transformOrigin: '117px 72px' }}>
                  <rect x="26" y="56" width="182" height="34" rx="7" fill="#1E293B" />
                  <text x="34" y="70" fill="#E2E8F0" fontSize="8">
                    &ldquo;Buatkan ERD Peter Chen rental
                  </text>
                  <text x="34" y="82" fill="#CBD5E1" fontSize="8">
                    mobil &amp; beri tautan FlowBoard&rdquo;
                  </text>
                </g>

                {/* AI reply + clickable link button */}
                <g className="fb-m-pop" style={{ animationDelay: '0.95s', transformOrigin: '117px 146px' }}>
                  <rect
                    x="26"
                    y="100"
                    width="182"
                    height="94"
                    rx="7"
                    fill="#111827"
                    stroke="#334155"
                    strokeWidth="1"
                  />
                  <text x="34" y="116" fill="#CBD5E1" fontSize="8">
                    Siap! Klik tautan ini untuk membuka
                  </text>
                  <text x="34" y="128" fill="#CBD5E1" fontSize="8">
                    ERD Peter Chen di kanvas Anda:
                  </text>

                  {/* Highlighted clickable button */}
                  <rect
                    x="34"
                    y="138"
                    width="166"
                    height="26"
                    rx="6"
                    fill="#2563EB"
                    className="fb-m-btn-click"
                    style={{ animationDelay: '2.35s', transformOrigin: '117px 151px' }}
                  />
                  <text x="117" y="154" textAnchor="middle" fill="#FFFFFF" fontSize="8.2" fontWeight="600">
                    🔗 Buka Diagram di FlowBoard
                  </text>
                  <text x="34" y="180" fill="#64748B" fontSize="7" fontFamily="monospace">
                    flow-board.../ ?kind=erd_chen
                  </text>

                  {/* Click ripple burst */}
                  <circle
                    cx="132"
                    cy="151"
                    r="16"
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth="2"
                    className="fb-m-ripple"
                    style={{ animationDelay: '2.35s', transformOrigin: '132px 151px' }}
                  />
                </g>

                {/* Animated Mouse Cursor gliding onto button and clicking */}
                <g className="fb-m-cursor" style={{ animationDelay: '1.4s' }}>
                  <path
                    d="M 132 151 L 132 167 L 136.5 163 L 140.5 170 L 143 168.5 L 139 161.5 L 144.5 161.5 Z"
                    fill="#FFFFFF"
                    stroke="#0F172A"
                    strokeWidth="1.2"
                  />
                </g>
              </g>

              {/* Connecting Teleport Beam: Button -> Canvas */}
              <path
                d="M 220 151 C 254 151, 254 116, 288 116"
                fill="none"
                stroke="#334155"
                strokeWidth="2"
                strokeDasharray="3 3"
              />
              <path
                d="M 220 151 C 254 151, 254 116, 288 116"
                fill="none"
                stroke="url(#fb-beam-indigo)"
                strokeWidth="3.2"
                strokeLinecap="round"
                filter="url(#fb-glow)"
                pathLength="100"
                className="fb-m-beam"
                style={{ animationDelay: '2.55s' }}
              />

              {/* Right Panel: Mini FlowBoard Canvas (ERD Peter Chen) */}
              <g className="fb-m-fade" style={{ animationDelay: '0.1s' }}>
                <rect
                  x="288"
                  y="18"
                  width="298"
                  height="198"
                  rx="10"
                  fill="#0F172A"
                  stroke="#334155"
                  strokeWidth="1.2"
                />
                <rect x="288" y="18" width="298" height="24" rx="10" fill="#1E293B" />
                <rect x="288" y="32" width="298" height="10" fill="#1E293B" />
                <rect x="298" y="25" width="10" height="10" rx="2.5" fill="#2563EB" />
                <text x="313" y="33.5" fill="#F8FAFC" fontSize="9.2" fontWeight="600">
                  FlowBoard • ERD Konseptual (Peter Chen)
                </text>

                {/* Attribute spokes (drawn behind ovals) */}
                <g>
                  <line x1="354" y1="106" x2="324" y2="74" stroke="#64748B" strokeWidth="1.1" pathLength="100" className="fb-m-draw" style={{ animationDelay: '4.15s' }} />
                  <line x1="354" y1="106" x2="386" y2="74" stroke="#64748B" strokeWidth="1.1" pathLength="100" className="fb-m-draw" style={{ animationDelay: '4.25s' }} />
                  <line x1="354" y1="132" x2="354" y2="158" stroke="#64748B" strokeWidth="1.1" pathLength="100" className="fb-m-draw" style={{ animationDelay: '4.35s' }} />

                  <line x1="520" y1="106" x2="492" y2="74" stroke="#64748B" strokeWidth="1.1" pathLength="100" className="fb-m-draw" style={{ animationDelay: '4.4s' }} />
                  <line x1="520" y1="106" x2="550" y2="74" stroke="#64748B" strokeWidth="1.1" pathLength="100" className="fb-m-draw" style={{ animationDelay: '4.5s' }} />
                  <line x1="520" y1="132" x2="520" y2="158" stroke="#64748B" strokeWidth="1.1" pathLength="100" className="fb-m-draw" style={{ animationDelay: '4.6s' }} />
                </g>

                {/* Relation lines + 1 / N cardinality */}
                <line x1="392" y1="119" x2="416" y2="119" stroke="#94A3B8" strokeWidth="1.3" pathLength="100" className="fb-m-draw" style={{ animationDelay: '3.75s' }} />
                <line x1="464" y1="119" x2="482" y2="119" stroke="#94A3B8" strokeWidth="1.3" pathLength="100" className="fb-m-draw" style={{ animationDelay: '3.85s' }} />
                <text x="404" y="114" textAnchor="middle" fill="#F8FAFC" fontSize="8" fontWeight="700" className="fb-m-fade" style={{ animationDelay: '3.95s' }}>
                  1
                </text>
                <text x="473" y="114" textAnchor="middle" fill="#F8FAFC" fontSize="8" fontWeight="700" className="fb-m-fade" style={{ animationDelay: '4.0s' }}>
                  N
                </text>

                {/* Entity 1: PELANGGAN */}
                <g className="fb-m-pop" style={{ animationDelay: '3.15s', transformOrigin: '354px 119px' }}>
                  <rect x="316" y="105" width="76" height="28" rx="3" fill="#1E3A8A" stroke="#60A5FA" strokeWidth="1.3" />
                  <text x="354" y="122" textAnchor="middle" fill="#EFF6FF" fontSize="7.8" fontWeight="700">
                    PELANGGAN
                  </text>
                </g>

                {/* Diamond Relation: MELAKUKAN */}
                <g className="fb-m-pop" style={{ animationDelay: '3.45s', transformOrigin: '440px 119px' }}>
                  <polygon points="440,98 466,119 440,140 414,119" fill="#422006" stroke="#FBBF24" strokeWidth="1.3" />
                  <text x="440" y="121.5" textAnchor="middle" fill="#FEF3C7" fontSize="6.7" fontWeight="600">
                    MELAKUKAN
                  </text>
                </g>

                {/* Entity 2: TRANSAKSI */}
                <g className="fb-m-pop" style={{ animationDelay: '3.3s', transformOrigin: '520px 119px' }}>
                  <rect x="482" y="105" width="76" height="28" rx="3" fill="#1E3A8A" stroke="#60A5FA" strokeWidth="1.3" />
                  <text x="520" y="122" textAnchor="middle" fill="#EFF6FF" fontSize="7.8" fontWeight="700">
                    TRANSAKSI
                  </text>
                </g>

                {/* Oval Attributes around PELANGGAN */}
                <g className="fb-m-pop" style={{ animationDelay: '4.25s', transformOrigin: '322px 68px' }}>
                  <ellipse cx="322" cy="68" rx="28" ry="12" fill="#1E293B" stroke="#38BDF8" strokeWidth="1.1" />
                  <text x="322" y="70.5" textAnchor="middle" fill="#E0F2FE" fontSize="6.8" textDecoration="underline">
                    id_plg
                  </text>
                </g>
                <g className="fb-m-pop" style={{ animationDelay: '4.4s', transformOrigin: '386px 68px' }}>
                  <ellipse cx="386" cy="68" rx="26" ry="12" fill="#1E293B" stroke="#94A3B8" strokeWidth="1.1" />
                  <text x="386" y="70.5" textAnchor="middle" fill="#E2E8F0" fontSize="6.8">
                    nama
                  </text>
                </g>
                <g className="fb-m-pop" style={{ animationDelay: '4.55s', transformOrigin: '354px 166px' }}>
                  <ellipse cx="354" cy="166" rx="28" ry="12" fill="#1E293B" stroke="#94A3B8" strokeWidth="1.1" />
                  <text x="354" y="168.5" textAnchor="middle" fill="#E2E8F0" fontSize="6.8">
                    email
                  </text>
                </g>

                {/* Oval Attributes around TRANSAKSI */}
                <g className="fb-m-pop" style={{ animationDelay: '4.6s', transformOrigin: '490px 68px' }}>
                  <ellipse cx="490" cy="68" rx="28" ry="12" fill="#1E293B" stroke="#38BDF8" strokeWidth="1.1" />
                  <text x="490" y="70.5" textAnchor="middle" fill="#E0F2FE" fontSize="6.8" textDecoration="underline">
                    id_trx
                  </text>
                </g>
                <g className="fb-m-pop" style={{ animationDelay: '4.75s', transformOrigin: '552px 68px' }}>
                  <ellipse cx="552" cy="68" rx="26" ry="12" fill="#1E293B" stroke="#94A3B8" strokeWidth="1.1" />
                  <text x="552" y="70.5" textAnchor="middle" fill="#E2E8F0" fontSize="6.8">
                    total
                  </text>
                </g>
                <g className="fb-m-pop" style={{ animationDelay: '4.9s', transformOrigin: '520px 166px' }}>
                  <ellipse cx="520" cy="166" rx="30" ry="12" fill="#1E293B" stroke="#94A3B8" strokeWidth="1.1" />
                  <text x="520" y="168.5" textAnchor="middle" fill="#E2E8F0" fontSize="6.8">
                    tgl_sewa
                  </text>
                </g>

                {/* Bottom Ready Toast */}
                <g className="fb-m-pop" style={{ animationDelay: '5.15s', transformOrigin: '437px 198px' }}>
                  <rect x="352" y="187" width="170" height="21" rx="10.5" fill="#15803D" />
                  <text x="437" y="200.5" textAnchor="middle" fill="#FFFFFF" fontSize="7.8" fontWeight="600">
                    ✓ Langsung Edit &amp; Ekspor PNG/SVG
                  </text>
                </g>
              </g>
            </g>
          )}
        </svg>
      </div>

      {/* Bottom Timeline & Scene Caption */}
      <div className="px-3 py-2 border-t border-[#1E293B] bg-[#0F172A]/95 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          {SCENES.map((scene, idx) => {
            const isPast = idx < sceneIdx;
            const isCurrent = idx === sceneIdx;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => handleSceneSelect(idx)}
                aria-label={`Putar adegan ${scene.label}`}
                className="h-1 rounded-full bg-[#1E293B] overflow-hidden text-left"
              >
                {isPast ? (
                  <span className="block h-full w-full bg-[#38BDF8]" />
                ) : isCurrent ? (
                  <span
                    key={`${scene.id}-${replayKey}`}
                    onAnimationEnd={handleAdvanceScene}
                    className="block h-full bg-[#38BDF8] fb-m-progress"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[#CBD5E1] leading-snug">{activeScene.caption}</p>
      </div>
    </div>
  );
}
