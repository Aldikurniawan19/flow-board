import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Bot,
  Check,
  Copy,
  Crown,
  KeyRound,
  Layers,
  Link2,
  Loader2,
  MessageCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { apiClient } from '../store/apiClient.js';
import { useBoardStore } from '../store/useBoardStore.js';
import { AiMotionShowcase } from './AiMotionShowcase.jsx';

const PRO_PLANS = [
  {
    id: 'monthly',
    name: 'Pro Bulanan',
    originalPrice: 'Rp 50.000',
    price: 'Rp 35.000',
    period: '/ bulan',
    badge: 'Promo 30%',
    description: 'Fleksibel untuk tugas akhir, proyek kuliah, atau sprint desain cepat.',
    perks: [
      'Remote MCP Server untuk Claude, Cursor & Antigravity',
      'API Key pribadi & OpenAPI Spec (ChatGPT Custom GPT)',
      'Impor langsung dari Tautan AI (Deep-Link & Draf)',
      'Generate DFD, ERD Crow Foot & Peter Chen anti-tumpuk',
    ],
  },
  {
    id: 'yearly',
    name: 'Pro Tahunan',
    originalPrice: '',
    price: 'Rp 249.000',
    period: '/ tahun',
    badge: 'Hemat 40%',
    description: 'Setara Rp 20.750/bulan — paling hemat untuk pemakaian rutin.',
    perks: [
      'Semua fitur Pro Bulanan tanpa batas generate',
      'Prioritas pembaruan notasi & layout AI terbaru',
      'Aktivasi cepat langsung untuk akun Anda',
      'Dukungan prioritas via WhatsApp Admin',
    ],
  },
];

const UPGRADE_HIGHLIGHTS = [
  {
    icon: Wand2,
    title: 'Langsung Jadi dari Prompt AI',
    description:
      'Cukup ketik permintaan di ChatGPT, Claude, Cursor, atau Antigravity — diagram otomatis tersusun di papan FlowBoard Anda tanpa gambar manual dari nol.',
  },
  {
    icon: Layers,
    title: 'Jauh Lebih Akurat & Sesuai Standar',
    description:
      'Mendukung notasi DFD (Gane-Sarson & Yourdon), ERD Relasional (Crow Foot), ERD Konseptual (Peter Chen), UML Class, Use Case, Sequence, hingga Flowchart.',
  },
  {
    icon: Zap,
    title: 'Layout Rapi Anti-Tumpuk & 100% Editabel',
    description:
      'Bukan gambar statis. Setiap komponen, atribut, dan garis relasi dapat digeser, diubah ukurannya (otomatis menyesuaikan jalur), serta diekspor ke PNG/SVG/JSON.',
  },
  {
    icon: Link2,
    title: 'Akses MCP Server, API Key & Tautan AI',
    description:
      'Buka kunci API Key pribadi, integrasi Remote MCP, Custom GPT Actions, serta impor instan lewat Tautan Deep-Link AI.',
  },
];

/**
 * Format ISO timestamp into concise Indonesian date string.
 * @param {string | null | undefined} iso
 */
function formatDate(iso) {
  if (!iso) return 'Belum pernah dipakai';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Resolve configured admin WhatsApp number from build env (digits only).
 * Set `VITE_ADMIN_WHATSAPP=628xxxxxxxxxx` in Vercel Environment Variables.
 */
function getAdminWhatsAppNumber() {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_WHATSAPP
      ? String(import.meta.env.VITE_ADMIN_WHATSAPP)
      : '6281234567890';
  const digits = raw.replace(/\D/g, '');
  return digits || '6281234567890';
}

/**
 * Modal for Integrasi AI & MCP:
 * - For Owner / Pro subscribers (`user.hasAiAccess === true`): full MCP Server, API Keys, OpenAPI, & Prompt tools.
 * - For Free accounts (`user.hasAiAccess !== true`): persuasive Pro pitch -> Pricing selector -> WhatsApp Admin CTA.
 * @param {{ open: boolean, onClose: () => void }} props
 */
export function AiIntegrationModal({ open, onClose }) {
  const user = useBoardStore((s) => s.user);
  const hasAiAccess = Boolean(user?.hasAiAccess);

  const [paywallStep, setPaywallStep] = useState(/** @type {'pitch' | 'pricing'} */ ('pitch'));
  const [selectedPlanId, setSelectedPlanId] = useState('yearly');
  const [atPitchBottom, setAtPitchBottom] = useState(false);
  const paywallBodyRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  const syncPitchScrollState = useCallback(() => {
    const el = paywallBodyRef.current;
    if (!el) return;
    const reachedBottom =
      el.scrollHeight <= el.clientHeight + 16 ||
      el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    setAtPitchBottom(reachedBottom);
  }, []);

  const [activeTab, setActiveTab] = useState(/** @type {'mcp' | 'prompt'} */ ('mcp'));
  const [keys, setKeys] = useState(
    /** @type {Array<{ id: string, name: string, keyPrefix: string, createdAt: string, lastUsedAt: string | null }>} */ ([]),
  );
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [oauthConnections, setOauthConnections] = useState(
    /** @type {Array<{ id: string, clientId: string, clientName: string, scope: string, createdAt: string, lastUsedAt: string | null }>} */ ([]),
  );
  const [revokingConnId, setRevokingConnId] = useState(/** @type {string | null} */ (null));
  const [keyName, setKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState(/** @type {string | null} */ (null));
  const [newSecret, setNewSecret] = useState('');
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://flow-board-dun.vercel.app';
  const mcpUrl = `${origin}/api/mcp`;
  const openApiUrl = `${origin}/api/openapi.json`;
  const llmsTxtUrl = `${origin}/llms.txt`;

  const mcpConfigJson = JSON.stringify(
    {
      mcpServers: {
        flowboard: {
          url: mcpUrl,
          headers: {
            Authorization: `Bearer ${newSecret || 'PASTE_FLOWBOARD_API_KEY_DISINI'}`,
          },
        },
      },
    },
    null,
    2,
  );

  const samplePromptDfd = `Baca panduan tool di ${llmsTxtUrl} lalu buatkan DFD Level 1 sistem pengiriman barang. Berikan tautan Markdown yang bisa langsung diklik (format [Buka Diagram di FlowBoard](url) tanpa spasi/enter di dalam URL) agar langsung terbuka di FlowBoard.`;
  const samplePromptErd = `Baca panduan tool di ${llmsTxtUrl} lalu buatkan ERD Konseptual (Peter Chen) sistem penyewaan kendaraan lengkap dengan atribut oval dan kardinalitas 1/N. Berikan tautan Markdown yang bisa langsung diklik (format [Buka Diagram di FlowBoard](url)) agar langsung terbuka di FlowBoard.`;

  useEffect(() => {
    if (!open || !user || !hasAiAccess) return;
    let cancelled = false;
    setLoadingKeys(true);
    setError('');
    Promise.all([
      apiClient.listApiKeys(),
      apiClient.listOAuthConnections().catch(() => ({ connections: [] })),
    ])
      .then(([keysRes, connRes]) => {
        if (!cancelled) {
          setKeys(keysRes.keys || []);
          setOauthConnections(connRes?.connections || []);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Gagal memuat daftar API Key.');
      })
      .finally(() => {
        if (!cancelled) setLoadingKeys(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user, hasAiAccess]);

  useEffect(() => {
    if (!open) {
      setNewSecret('');
      setError('');
      setKeyName('');
      setPaywallStep('pitch');
      setAtPitchBottom(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || hasAiAccess || paywallStep !== 'pitch') return undefined;
    const el = paywallBodyRef.current;
    if (el) el.scrollTop = 0;

    const rafId = window.requestAnimationFrame(() => {
      syncPitchScrollState();
    });
    window.addEventListener('resize', syncPitchScrollState);
    let ro = null;
    if (el && typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(() => syncPitchScrollState());
      ro.observe(el);
    }
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', syncPitchScrollState);
      if (ro) ro.disconnect();
    };
  }, [open, hasAiAccess, paywallStep, syncPitchScrollState]);

  if (!open) return null;

  const selectedPlan = PRO_PLANS.find((p) => p.id === selectedPlanId) || PRO_PLANS[1];
  const waNumber = getAdminWhatsAppNumber();
  const waMessage = `Halo Admin FlowBoard, saya ingin berlangganan paket *${selectedPlan.name}* (${selectedPlan.price} ${selectedPlan.period}) untuk mengaktifkan fitur Integrasi AI, MCP Server & Tautan AI.\n\nEmail akun FlowBoard saya: ${user?.email || '-'}`;
  const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}`;

  /**
   * @param {string} id
   * @param {string} value
   */
  async function handleCopy(id, value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? '' : prev));
      }, 1800);
    } catch {
      setError('Gagal menyalin ke clipboard browser.');
    }
  }

  /** @param {import('react').FormEvent} e */
  async function handleCreateKey(e) {
    e.preventDefault();
    if (!keyName.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      const res = await apiClient.createApiKey(keyName.trim());
      setKeys((prev) => [res.apiKey, ...prev]);
      setNewSecret(res.secret);
      setKeyName('');
    } catch (err) {
      setError(/** @type {Error} */ (err)?.message || 'Gagal membuat API Key baru.');
    } finally {
      setCreating(false);
    }
  }

  /** @param {string} id */
  async function handleDeleteKey(id) {
    if (revokingId) return;
    setRevokingId(id);
    setError('');
    try {
      await apiClient.deleteApiKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      setError(/** @type {Error} */ (err)?.message || 'Gagal mencabut API Key.');
    } finally {
      setRevokingId(null);
    }
  }

  /** @param {string} id */
  async function handleRevokeConnection(id) {
    if (revokingConnId) return;
    setRevokingConnId(id);
    setError('');
    try {
      await apiClient.revokeOAuthConnection(id);
      setOauthConnections((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(/** @type {Error} */ (err)?.message || 'Gagal mencabut koneksi aplikasi AI.');
    } finally {
      setRevokingConnId(null);
    }
  }

  // Paywall View for Free / Non-Pro users
  if (!hasAiAccess) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-integration-modal-title"
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-sm overflow-hidden"
        >
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-[#FEE2E2] text-[#B91C1C] flex items-center justify-center shrink-0">
                <Crown className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="ai-integration-modal-title" className="text-sm font-semibold text-[#0F172A]">
                    {paywallStep === 'pitch'
                      ? 'Integrasi AI & MCP — FlowBoard Pro'
                      : 'Pilih Paket FlowBoard Pro'}
                  </h2>
                  <span className="rounded-full bg-[#FEE2E2] px-1.5 py-0.5 text-[10px] font-semibold text-[#B91C1C] leading-none">
                    Pro
                  </span>
                </div>
                <p className="text-xs text-[#475569]">
                  {paywallStep === 'pitch'
                    ? 'Rancang diagram sistem jauh lebih praktis, cepat, dan akurat langsung dari AI.'
                    : 'Aktivasi instan melalui Admin WhatsApp untuk akun FlowBoard Anda.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup dialog integrasi AI"
              className="p-1.5 rounded-lg text-[#475569] hover:bg-[#F1F5F9]"
            >
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          {/* Body */}
          <div
            ref={paywallBodyRef}
            onScroll={paywallStep === 'pitch' ? syncPitchScrollState : undefined}
            className="flex-1 overflow-y-auto p-5 space-y-4 text-xs"
          >
            {paywallStep === 'pitch' ? (
              <>
                <AiMotionShowcase />

                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#1D4ED8]">
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span>Hemat Berjam-jam Kerja Manual</span>
                  </div>
                  <h3 className="text-sm font-semibold text-[#0F172A] leading-snug">
                    Buat DFD, ERD Relasional, ERD Peter Chen & UML 10× Lebih Cepat Langsung dari AI
                  </h3>
                  <p className="text-xs text-[#475569] leading-relaxed">
                    Daripada menyusun kotak, atribut oval, dan panah relasi satu per satu secara manual, cukup beri prompt ke AI favorit Anda — FlowBoard otomatis menyusunnya rapi, akurat sesuai standar, dan langsung siap diedit di kanvas.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {UPGRADE_HIGHLIGHTS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.title}
                        className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] p-3 space-y-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-md bg-[#DBEAFE] text-[#1D4ED8] flex items-center justify-center shrink-0">
                            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          </div>
                          <span className="font-semibold text-[#0F172A]">{item.title}</span>
                        </div>
                        <p className="text-[11px] text-[#475569] leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setPaywallStep('pitch')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#1D4ED8]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>Kembali ke Ringkasan Fitur</span>
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PRO_PLANS.map((plan) => {
                    const isSelected = plan.id === selectedPlan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`text-left rounded-xl border p-4 transition-colors space-y-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
                          isSelected
                            ? 'border-[#1D4ED8] bg-[#DBEAFE]/40'
                            : 'border-[#E2E8F0] bg-[#FFFFFF] hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[#0F172A]">{plan.name}</span>
                          {plan.badge ? (
                            <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold text-[#15803D]">
                              {plan.badge}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          {plan.originalPrice ? (
                            <span className="text-xs font-medium text-[#94A3B8] line-through font-mono-tabular">
                              {plan.originalPrice}
                            </span>
                          ) : null}
                          <span className="text-lg font-bold text-[#0F172A] font-mono-tabular">
                            {plan.price}
                          </span>
                          <span className="text-[11px] text-[#475569]">{plan.period}</span>
                        </div>

                        <p className="text-[11px] text-[#475569] leading-relaxed">
                          {plan.description}
                        </p>

                        <ul className="space-y-1.5 pt-1 border-t border-[#E2E8F0]">
                          {plan.perks.map((perk) => (
                            <li key={perk} className="flex items-start gap-1.5 text-[11px] text-[#0F172A]">
                              <Check
                                className="h-3.5 w-3.5 text-[#15803D] shrink-0 mt-0.5"
                                strokeWidth={2}
                                aria-hidden="true"
                              />
                              <span>{perk}</span>
                            </li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[11px] text-[#475569] leading-relaxed">
                  Klik tombol di bawah untuk menghubungi <strong className="text-[#0F172A]">Admin via WhatsApp</strong> dengan pesan otomatis berisi paket pilihan (<strong className="text-[#0F172A]">{selectedPlan.name}</strong>) dan email akun Anda (<code className="font-mono-tabular text-[#0F172A]">{user?.email || '-'}</code>).
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-end gap-2">
            {paywallStep === 'pitch' ? (
              atPitchBottom ? (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-3.5 py-2 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9]"
                  >
                    Nanti Saja
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaywallStep('pricing')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
                  >
                    <Crown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span>Berlangganan Pro</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const el = paywallBodyRef.current;
                    if (el && typeof el.scrollTo === 'function') {
                      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
                    } else if (el) {
                      el.scrollTop = el.scrollHeight;
                    }
                    syncPitchScrollState();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
                >
                  <span>Berlangganan Pro</span>
                  <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              )
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-3.5 py-2 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9]"
                >
                  Tutup
                </button>
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803D] px-4 py-2 text-xs font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15803D]"
                >
                  <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>Hubungi Admin via WhatsApp</span>
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Full Access View for Owner / Pro subscribers
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-integration-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-sm overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#DBEAFE] text-[#1D4ED8] flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="ai-integration-modal-title" className="text-sm font-semibold text-[#0F172A]">
                  Integrasi AI & MCP Server
                </h2>
                <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold text-[#15803D] leading-none">
                  {user?.isOwner ? 'Owner' : 'Pro Aktif'}
                </span>
              </div>
              <p className="text-xs text-[#475569]">
                Hubungkan Claude, ChatGPT, Cursor, Gemini, atau AI lain agar bisa langsung membuat diagram di FlowBoard.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog integrasi AI"
            className="p-1.5 rounded-lg text-[#475569] hover:bg-[#F1F5F9]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 border-b border-[#E2E8F0] flex items-center gap-1.5 bg-[#F8FAFC]">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'mcp'}
            onClick={() => setActiveTab('mcp')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'mcp'
                ? 'border-[#1D4ED8] text-[#1D4ED8]'
                : 'border-transparent text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span>MCP Server & API Key</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'prompt'}
            onClick={() => setActiveTab('prompt')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'prompt'
                ? 'border-[#1D4ED8] text-[#1D4ED8]'
                : 'border-transparent text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <Link2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span>Prompt & Tautan AI</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-[#B91C1C]/30 bg-[#FEE2E2] px-3 py-2 text-[#B91C1C]"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'mcp' ? (
            <>
              {/* 1-Click OAuth 2.1 + DCR Banner */}
              <div className="rounded-lg border border-[#1D4ED8]/25 bg-[#DBEAFE]/40 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="inline-flex items-center gap-1.5 font-semibold text-[#0F172A]">
                    <ShieldCheck className="h-4 w-4 text-[#1D4ED8]" strokeWidth={1.75} aria-hidden="true" />
                    <span>Koneksi 1-Klik via OAuth 2.1 + DCR (Claude.ai Web / ChatGPT / Gemini Enterprise)</span>
                  </div>
                  <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold text-[#15803D] leading-none">
                    Tanpa API Key Manual
                  </span>
                </div>
                <p className="text-[11px] text-[#475569] leading-relaxed">
                  Cukup tempel <strong>Endpoint MCP</strong> di bawah pada menu Connector / Remote MCP klien AI Anda. Jendela <strong>&ldquo;Login dengan FlowBoard&rdquo;</strong> akan muncul otomatis (mendukung RFC 9728, RFC 8414, Dynamic Client Registration, dan PKCE S256).
                </p>
              </div>

              {/* Endpoints */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1.5">
                  <div className="font-semibold text-[#0F172A]">Endpoint MCP (Streamable HTTP)</div>
                  <div className="flex items-center gap-1.5">
                    <code className="flex-1 truncate rounded bg-[#FFFFFF] border border-[#E2E8F0] px-2 py-1 font-mono-tabular text-[11px] text-[#0F172A]">
                      {mcpUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopy('mcp-url', mcpUrl)}
                      aria-label="Salin URL MCP"
                      className="p-1.5 rounded-md border border-[#E2E8F0] bg-[#FFFFFF] text-[#475569] hover:text-[#1D4ED8]"
                    >
                      {copiedId === 'mcp-url' ? (
                        <Check className="h-3.5 w-3.5 text-[#15803D]" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1.5">
                  <div className="font-semibold text-[#0F172A]">OpenAPI Spec (Custom GPT)</div>
                  <div className="flex items-center gap-1.5">
                    <code className="flex-1 truncate rounded bg-[#FFFFFF] border border-[#E2E8F0] px-2 py-1 font-mono-tabular text-[11px] text-[#0F172A]">
                      {openApiUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopy('openapi-url', openApiUrl)}
                      aria-label="Salin URL OpenAPI"
                      className="p-1.5 rounded-md border border-[#E2E8F0] bg-[#FFFFFF] text-[#475569] hover:text-[#1D4ED8]"
                    >
                      {copiedId === 'openapi-url' ? (
                        <Check className="h-3.5 w-3.5 text-[#15803D]" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* API Key Manager */}
              <div className="rounded-lg border border-[#E2E8F0] p-3.5 space-y-3">
                <div>
                  <h3 className="font-semibold text-[#0F172A]">API Key Pribadi</h3>
                  <p className="text-[11px] text-[#475569] mt-0.5">
                    Dengan API Key, AI dapat langsung menyimpan papan diagram baru ke akun FlowBoard Anda.
                  </p>
                </div>

                <form onSubmit={handleCreateKey} className="flex items-center gap-2">
                  <label htmlFor="api-key-name-input" className="sr-only">
                    Nama API Key
                  </label>
                  <input
                    id="api-key-name-input"
                    type="text"
                    maxLength={60}
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="Misal: Claude Desktop, Cursor, ChatGPT"
                    className="flex-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#0F172A] focus:bg-[#FFFFFF] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                  />
                  <button
                    type="submit"
                    disabled={!keyName.trim() || creating}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1E40AF] disabled:opacity-50"
                  >
                    {creating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    <span>Buat Key</span>
                  </button>
                </form>

                {newSecret && (
                  <div className="rounded-lg border border-[#15803D]/30 bg-[#DCFCE7] p-3 space-y-1.5">
                    <div className="font-semibold text-[#15803D]">
                      API Key berhasil dibuat — simpan sekarang (hanya tampil satu kali):
                    </div>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 break-all rounded bg-[#FFFFFF] border border-[#15803D]/30 px-2.5 py-1.5 font-mono-tabular text-[11px] text-[#0F172A]">
                        {newSecret}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy('new-secret', newSecret)}
                        aria-label="Salin API Key baru"
                        className="inline-flex items-center gap-1 rounded-md bg-[#15803D] px-2.5 py-1.5 text-[11px] font-medium text-white hover:opacity-90 shrink-0"
                      >
                        {copiedId === 'new-secret' ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Disalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {loadingKeys ? (
                  <div className="flex items-center gap-2 text-[#475569] py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Memuat daftar API Key...</span>
                  </div>
                ) : keys.length === 0 ? (
                  <p className="text-[11px] text-[#475569] py-1">
                    Belum ada API Key aktif. Buat satu di atas untuk menghubungkan AI Agent ke akun Anda.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#E2E8F0] rounded-lg border border-[#E2E8F0] overflow-hidden">
                    {keys.map((k) => (
                      <li
                        key={k.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-[#FFFFFF]"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-[#0F172A] truncate">{k.name}</div>
                          <div className="text-[11px] text-[#475569] font-mono-tabular">
                            {k.keyPrefix}•••••••• • Dipakai: {formatDate(k.lastUsedAt)}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={revokingId === k.id}
                          onClick={() => handleDeleteKey(k.id)}
                          aria-label={`Cabut API Key ${k.name}`}
                          className="p-1.5 rounded-md text-[#475569] hover:bg-[#FEE2E2] hover:text-[#B91C1C] disabled:opacity-40 shrink-0"
                        >
                          {revokingId === k.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Connected OAuth AI Apps */}
              <div className="rounded-lg border border-[#E2E8F0] p-3.5 space-y-2.5">
                <div>
                  <h3 className="font-semibold text-[#0F172A]">Aplikasi AI Terhubung (OAuth 2.1)</h3>
                  <p className="text-[11px] text-[#475569] mt-0.5">
                    Daftar klien AI yang Anda izinkan lewat tombol &ldquo;Login dengan FlowBoard&rdquo;. Cabut akses kapan saja.
                  </p>
                </div>
                {oauthConnections.length === 0 ? (
                  <p className="text-[11px] text-[#475569] py-0.5">
                    Belum ada aplikasi AI yang terhubung lewat OAuth 2.1.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#E2E8F0] rounded-lg border border-[#E2E8F0] overflow-hidden">
                    {oauthConnections.map((conn) => (
                      <li
                        key={conn.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-[#FFFFFF]"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-[#0F172A] truncate">{conn.clientName}</div>
                          <div className="text-[11px] text-[#475569] font-mono-tabular">
                            Scope: {conn.scope} &bull; Dipakai: {formatDate(conn.lastUsedAt)}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={revokingConnId === conn.id}
                          onClick={() => handleRevokeConnection(conn.id)}
                          aria-label={`Cabut koneksi OAuth ${conn.clientName}`}
                          className="p-1.5 rounded-md text-[#475569] hover:bg-[#FEE2E2] hover:text-[#B91C1C] disabled:opacity-40 shrink-0"
                        >
                          {revokingConnId === conn.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* MCP JSON Snippet */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#0F172A]">
                    Konfigurasi MCP (Claude Desktop / Cursor / Antigravity)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy('mcp-json', mcpConfigJson)}
                    className="inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 text-[11px] font-medium text-[#0F172A] hover:border-[#1D4ED8]"
                  >
                    {copiedId === 'mcp-json' ? (
                      <>
                        <Check className="h-3 w-3 text-[#15803D]" />
                        <span>Disalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Salin JSON</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 font-mono-tabular text-[11px] text-[#0F172A] overflow-x-auto leading-relaxed">
                  {mcpConfigJson}
                </pre>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 space-y-2">
                <div className="font-semibold text-[#0F172A]">
                  Panduan AI (<code className="font-mono-tabular">/llms.txt</code>)
                </div>
                <p className="text-[11px] text-[#475569] leading-relaxed">
                  AI seperti ChatGPT, Gemini, Claude, atau Perplexity bisa membaca halaman panduan ini untuk menghasilkan tautan langsung yang terbuka otomatis di akun FlowBoard Pro Anda.
                </p>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 truncate rounded bg-[#FFFFFF] border border-[#E2E8F0] px-2.5 py-1.5 font-mono-tabular text-[11px] text-[#0F172A]">
                    {llmsTxtUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopy('llms-url', llmsTxtUrl)}
                    aria-label="Salin URL llms.txt"
                    className="inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] bg-[#FFFFFF] px-2.5 py-1.5 text-[11px] font-medium text-[#0F172A] hover:border-[#1D4ED8]"
                  >
                    {copiedId === 'llms-url' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#15803D]" />
                        <span>Disalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="font-semibold text-[#0F172A]">Contoh Prompt Siap Pakai</div>

                <div className="rounded-lg border border-[#E2E8F0] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#0F172A]">1. Generate DFD Level 1</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('prompt-dfd', samplePromptDfd)}
                      className="inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 text-[11px] font-medium text-[#0F172A] hover:border-[#1D4ED8]"
                    >
                      {copiedId === 'prompt-dfd' ? (
                        <>
                          <Check className="h-3 w-3 text-[#15803D]" />
                          <span>Disalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Salin Prompt</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="rounded bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 text-[11px] text-[#475569] leading-relaxed">
                    {samplePromptDfd}
                  </p>
                </div>

                <div className="rounded-lg border border-[#E2E8F0] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#0F172A]">2. Generate ERD Konseptual (Peter Chen)</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('prompt-erd', samplePromptErd)}
                      className="inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 text-[11px] font-medium text-[#0F172A] hover:border-[#1D4ED8]"
                    >
                      {copiedId === 'prompt-erd' ? (
                        <>
                          <Check className="h-3 w-3 text-[#15803D]" />
                          <span>Disalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Salin Prompt</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="rounded bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 text-[11px] text-[#475569] leading-relaxed">
                    {samplePromptErd}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-3.5 py-2 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9]"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
