import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { apiClient } from '../store/apiClient.js';
import { useBoardStore } from '../store/useBoardStore.js';

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
 * Modal for connecting external AI assistants (Claude, ChatGPT, Cursor, Antigravity, Gemini)
 * via Remote MCP Server + API Keys (Cara 1) and Deep-Link / llms.txt prompts (Cara 2).
 * @param {{ open: boolean, onClose: () => void }} props
 */
export function AiIntegrationModal({ open, onClose }) {
  const user = useBoardStore((s) => s.user);
  const [activeTab, setActiveTab] = useState(/** @type {'mcp' | 'prompt'} */ ('mcp'));
  const [keys, setKeys] = useState(
    /** @type {Array<{ id: string, name: string, keyPrefix: string, createdAt: string, lastUsedAt: string | null }>} */ ([]),
  );
  const [loadingKeys, setLoadingKeys] = useState(false);
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
    if (!open || !user) return;
    let cancelled = false;
    setLoadingKeys(true);
    setError('');
    apiClient
      .listApiKeys()
      .then((res) => {
        if (!cancelled) setKeys(res.keys || []);
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
  }, [open, user]);

  useEffect(() => {
    if (!open) {
      setNewSecret('');
      setError('');
      setKeyName('');
    }
  }, [open]);

  if (!open) return null;

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
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-sm overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#DBEAFE] text-[#1D4ED8] flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <h2 id="ai-integration-modal-title" className="text-sm font-semibold text-[#0F172A]">
                Integrasi AI & MCP Server
              </h2>
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
            <span>Prompt & Tautan AI (Tanpa Setup)</span>
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

                {!user ? (
                  <p className="text-[11px] text-[#475569] rounded-md bg-[#F8FAFC] border border-[#E2E8F0] p-2.5">
                    Masuk ke akun FlowBoard terlebih dahulu untuk membuat API Key pribadi. Tanpa API Key, endpoint MCP tetap bisa membuat draf publik sementara.
                  </p>
                ) : (
                  <>
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
                  </>
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
                  Panduan AI Publik (<code className="font-mono-tabular">/llms.txt</code>)
                </div>
                <p className="text-[11px] text-[#475569] leading-relaxed">
                  AI seperti ChatGPT, Gemini, Claude, atau Perplexity bisa membaca halaman panduan ini untuk mengetahui format tautan langsung FlowBoard — tanpa API key atau instalasi plugin.
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
