import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Crown,
  Layers,
  Link2,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../store/apiClient.js';
import { useBoardStore } from '../store/useBoardStore.js';
import { AiBrandIcon } from './AiBrandIcon.jsx';

const OAUTH_PERMISSIONS = [
  'Membuat dan menyimpan diagram DFD, ERD, UML, serta Flowchart baru ke papan kerja Anda',
  'Membaca daftar dan struktur papan kerja FlowBoard milik akun Anda',
  'Memperbarui atau menghapus papan kerja atas perintah langsung Anda di chat AI',
];

/**
 * OAuth 2.1 Consent Screen rendered at `/oauth/authorize` after the user logs into FlowBoard.
 * Enables 1-click "Login dengan FlowBoard" for Claude.ai Web, ChatGPT MCP, Gemini Enterprise, etc.
 * @param {{ onOpenUpgrade?: () => void, onRedirect?: (url: string) => void }} props
 */
export function OAuthConsentScreen({ onOpenUpgrade, onRedirect }) {
  const user = useBoardStore((s) => s.user);
  const logout = useBoardStore((s) => s.logout);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(/** @type {'approve' | 'deny' | null} */ (null));
  const [error, setError] = useState('');
  const [info, setInfo] = useState(
    /** @type {{ client: { clientId: string, clientName: string, redirectUri: string, redirectHost: string }, scope: string, resource: string | null, state: string } | null} */ (
      null
    ),
  );

  const search = typeof window !== 'undefined' ? window.location.search : '';
  const hintRedirectUri = new URLSearchParams(search).get('redirect_uri') || '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiClient
      .getOAuthAuthorizeInfo(search)
      .then((res) => {
        if (!cancelled) {
          setInfo(res);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            /** @type {Error} */ (err)?.message ||
              'Permintaan otorisasi OAuth tidak valid atau sudah kedaluwarsa.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  const navigateAway = (/** @type {string} */ targetUrl) => {
    if (onRedirect) {
      onRedirect(targetUrl);
      return;
    }
    window.location.assign(targetUrl);
  };

  /** @param {'approve' | 'deny'} decision */
  async function handleDecision(decision) {
    if (!info || submitting) return;
    setSubmitting(decision);
    setError('');

    const params = new URLSearchParams(search);
    try {
      const res = await apiClient.submitOAuthDecision({
        decision,
        client_id: params.get('client_id') || info.client.clientId,
        redirect_uri: params.get('redirect_uri') || info.client.redirectUri,
        response_type: 'code',
        code_challenge: params.get('code_challenge') || '',
        code_challenge_method: 'S256',
        state: params.get('state') || '',
        scope: params.get('scope') || info.scope,
        resource: params.get('resource') || undefined,
      });
      if (res?.redirectTo) {
        navigateAway(res.redirectTo);
      }
    } catch (err) {
      setError(/** @type {Error} */ (err)?.message || 'Gagal memproses keputusan otorisasi.');
      setSubmitting(null);
    }
  }

  const hasAiAccess = Boolean(user?.hasAiAccess);

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#1D4ED8] text-white flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <Link2 className="h-4 w-4 text-[#64748B]" strokeWidth={1.75} aria-hidden="true" />
          <AiBrandIcon
            clientName={info?.client.clientName}
            redirectUri={info?.client.redirectUri || hintRedirectUri}
            size="md"
          />
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#1D4ED8]" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm text-[#475569]">Memverifikasi permintaan otorisasi MCP OAuth...</p>
            </div>
          ) : !info ? (
            <div className="space-y-4 text-center py-4">
              <div className="mx-auto h-11 w-11 rounded-full bg-[#FEE2E2] text-[#B91C1C] flex items-center justify-center">
                <AlertCircle className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h1 className="text-base font-semibold text-[#0F172A]">
                  Permintaan Otorisasi Tidak Valid
                </h1>
                <p role="alert" className="text-xs text-[#B91C1C] leading-relaxed">
                  {error || 'Parameter OAuth 2.1 tidak valid.'}
                </p>
              </div>
              <a
                href="/"
                className="inline-flex items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-4 py-2 text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9]"
              >
                Kembali ke FlowBoard
              </a>
            </div>
          ) : (
            <>
              <div className="text-center space-y-1">
                <h1 className="text-lg font-semibold text-[#0F172A]">
                  Hubungkan {info.client.clientName} ke FlowBoard
                </h1>
                <p className="text-xs text-[#475569]">
                  Aplikasi AI dari{' '}
                  <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono-tabular text-[#0F172A]">
                    {info.client.redirectHost}
                  </code>{' '}
                  meminta izin akses ke MCP Server FlowBoard Anda.
                </p>
              </div>

              {/* Active account summary */}
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold text-[#0F172A] truncate">{user?.name}</div>
                  <div className="text-[11px] text-[#475569] truncate">{user?.email}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none ${
                      hasAiAccess
                        ? 'bg-[#DCFCE7] text-[#15803D]'
                        : 'bg-[#FEE2E2] text-[#B91C1C]'
                    }`}
                  >
                    {user?.isOwner ? 'Owner' : hasAiAccess ? 'Pro Aktif' : 'Akun Gratis'}
                  </span>
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="text-[11px] font-medium text-[#1D4ED8] hover:underline"
                  >
                    Ganti Akun
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-[#B91C1C]/30 bg-[#FEE2E2] px-3 py-2 text-xs text-[#B91C1C]"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {!hasAiAccess ? (
                <div className="rounded-xl border border-[#FEE2E2] bg-[#FEF2F2] p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <Crown className="h-4 w-4 text-[#B91C1C] shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-[#0F172A]">
                        Koneksi MCP OAuth Khusus FlowBoard Pro
                      </div>
                      <p className="text-[11px] text-[#475569] leading-relaxed">
                        Akun Anda saat ini berada di paket Gratis. Upgrade ke FlowBoard Pro terlebih dahulu agar dapat menghubungkan Claude.ai, ChatGPT, atau Gemini Enterprise melalui OAuth 2.1.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={Boolean(submitting)}
                      onClick={() => handleDecision('deny')}
                      className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-3.5 py-2 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-50"
                    >
                      Batalkan & Kembali
                    </button>
                    {onOpenUpgrade && (
                      <button
                        type="button"
                        onClick={onOpenUpgrade}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E40AF]"
                      >
                        <Crown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        <span>Lihat Paket Pro</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Permissions list */}
                  <div className="rounded-lg border border-[#E2E8F0] p-3.5 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A]">
                      <ShieldCheck className="h-4 w-4 text-[#15803D]" strokeWidth={1.75} aria-hidden="true" />
                      <span>Izin yang diminta ({info.scope}):</span>
                    </div>
                    <ul className="space-y-2">
                      {OAUTH_PERMISSIONS.map((perm) => (
                        <li key={perm} className="flex items-start gap-2 text-xs text-[#475569]">
                          <CheckCircle2
                            className="h-3.5 w-3.5 text-[#15803D] shrink-0 mt-0.5"
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                          <span>{perm}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-[#64748B] pt-1 border-t border-[#E2E8F0]">
                      Anda dapat mencabut akses aplikasi ini kapan saja dari menu <strong>Integrasi AI & MCP</strong> di FlowBoard.
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={Boolean(submitting)}
                      onClick={() => handleDecision('deny')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-4 py-2 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-50"
                    >
                      {submitting === 'deny' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      )}
                      <span>Tolak</span>
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(submitting)}
                      onClick={() => handleDecision('approve')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] disabled:opacity-50"
                    >
                      {submitting === 'approve' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      )}
                      <span>Izinkan & Hubungkan</span>
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <footer className="mt-5 text-xs text-[#64748B] text-center">
        OAuth 2.1 + PKCE S256 &bull; FlowBoard MCP Server
      </footer>
    </main>
  );
}
