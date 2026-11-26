import { useEffect, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Layers, Loader2, Lock, Mail, Moon, Sun, User } from 'lucide-react';
import { useBoardStore } from '../store/useBoardStore.js';

const AUTH_ERROR_MESSAGES = {
  google_not_configured:
    'Login Google belum diaktifkan di server. Admin perlu mengatur GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET.',
  google_cancelled: 'Proses masuk dengan Google dibatalkan.',
  google_invalid_state: 'Sesi otorisasi Google tidak valid atau telah kedaluwarsa. Silakan coba lagi.',
  google_exchange_failed: 'Gagal menukar kode otorisasi Google. Silakan coba lagi.',
  google_profile_failed: 'Gagal mengambil profil akun Google Anda.',
  google_email_unverified: 'Alamat email pada akun Google Anda belum terverifikasi.',
};

/**
 * Official 4-color Google "G" mark.
 */
function GoogleLogoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

/**
 * Authentication screen for login and registration.
 * @param {{ oauthNotice?: boolean }} [props]
 */
export function AuthScreen({ oauthNotice = false } = {}) {
  const [mode, setMode] = useState(/** @type {'login' | 'register'} */ ('login'));
  const [slideDir, setSlideDir] = useState(/** @type {'none' | 'left' | 'right'} */ ('none'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const login = useBoardStore((s) => s.login);
  const register = useBoardStore((s) => s.register);
  const theme = useBoardStore((s) => s.theme);
  const toggleTheme = useBoardStore((s) => s.toggleTheme);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('auth_error');
    if (code) {
      setError(
        AUTH_ERROR_MESSAGES[/** @type {keyof typeof AUTH_ERROR_MESSAGES} */ (code)] ||
          'Gagal masuk menggunakan akun Google. Silakan coba lagi.',
      );
      params.delete('auth_error');
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
      try {
        window.history.replaceState({}, '', nextUrl);
      } catch {
        // Ignore history API restrictions in non-browser test runners
      }
    }
  }, []);

  const currentReturnTo =
    typeof window !== 'undefined' && window.location.pathname === '/oauth/authorize'
      ? `${window.location.pathname}${window.location.search}`
      : '/';
  const googleAuthHref = `/api/auth/google?returnTo=${encodeURIComponent(currentReturnTo)}`;

  /** @param {'login' | 'register'} nextMode */
  function switchMode(nextMode) {
    if (nextMode === mode) return;
    setSlideDir(nextMode === 'register' ? 'right' : 'left');
    setMode(nextMode);
    setShowPassword(false);
    setError('');
  }

  /** @param {import('react').FormEvent} e */
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register(name.trim(), email.trim(), password);
      }
    } catch (err) {
      setError(err?.message || 'Proses autentikasi gagal. Periksa kembali data Anda.');
    } finally {
      setSubmitting(false);
    }
  }

  const slideClass =
    slideDir === 'right'
      ? 'animate-auth-slide-right'
      : slideDir === 'left'
        ? 'animate-auth-slide-left'
        : '';

  return (
    <main className="relative min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4 py-12">
      <button
        type="button"
        onClick={(e) => toggleTheme(e)}
        aria-label={theme === 'dark' ? 'Aktifkan tema terang' : 'Aktifkan tema gelap'}
        aria-pressed={theme === 'dark'}
        title={theme === 'dark' ? 'Ganti ke Tema Terang' : 'Ganti ke Tema Gelap'}
        className="fixed top-4 right-4 inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-medium text-[#475569] shadow-sm hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
      >
        {theme === 'dark' ? (
          <Sun className="h-4 w-4 text-[#FBBF24]" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Moon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        )}
        <span>{theme === 'dark' ? 'Tema Terang' : 'Tema Gelap'}</span>
      </button>

      <div className="w-full max-w-md bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-[#1D4ED8] text-white flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">FlowBoard</h1>
        </div>

        {oauthNotice && (
          <div className="mb-4 rounded-lg border border-[#1D4ED8]/25 bg-[#DBEAFE]/50 px-3 py-2 text-xs text-[#1E3A8A] text-center leading-relaxed">
            Masuk ke akun FlowBoard Anda untuk melanjutkan otorisasi koneksi AI (MCP OAuth 2.1).
          </div>
        )}

        <div
          role="tablist"
          aria-label="Mode autentikasi"
          className="relative grid grid-cols-2 p-1 bg-[#F1F5F9] rounded-lg mb-6"
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-[#FFFFFF] shadow-xs transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              mode === 'register' ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => switchMode('login')}
            className={`relative z-10 py-2 text-sm font-medium rounded-md transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
              mode === 'login' ? 'text-[#0F172A]' : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Masuk
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            onClick={() => switchMode('register')}
            className={`relative z-10 py-2 text-sm font-medium rounded-md transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
              mode === 'register' ? 'text-[#0F172A]' : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Daftar Akun
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-[#B91C1C]/30 bg-[#FEE2E2] px-3 py-2.5 text-sm text-[#B91C1C]"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="overflow-hidden -mx-1 px-1 py-0.5">
          <form
            key={mode}
            onSubmit={handleSubmit}
            className={`h-[276px] flex flex-col justify-between ${slideClass}`}
          >
            <div className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label htmlFor="auth-name" className="block text-xs font-medium text-[#475569] mb-1.5">
                    Nama Lengkap
                  </label>
                  <div className="relative">
                    <User
                      className="h-4 w-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <input
                      id="auth-name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nama Anda"
                      autoComplete="name"
                      className="w-full rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] pl-9 pr-3 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-xs font-medium text-[#475569] mb-1.5">
                  Alamat Email
                </label>
                <div className="relative">
                  <Mail
                    className="h-4 w-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@contoh.com"
                    autoComplete="email"
                    className="w-full rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] pl-9 pr-3 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="auth-password" className="block text-xs font-medium text-[#475569] mb-1.5">
                  Kata Sandi
                </label>
                <div className="relative">
                  <Lock
                    className="h-4 w-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={mode === 'register' ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'Minimal 8 karakter' : 'Masukkan kata sandi'}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] pl-9 pr-10 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                    aria-pressed={showPassword}
                    title={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />}
              <span>
                {submitting
                  ? mode === 'login'
                    ? 'Memproses masuk...'
                    : 'Mendaftarkan akun...'
                  : mode === 'login'
                    ? 'Masuk ke FlowBoard'
                    : 'Buat Akun Baru'}
              </span>
            </button>
          </form>
        </div>

        <div className="my-4 flex items-center gap-3" aria-hidden="true">
          <div className="h-px flex-1 bg-[#E2E8F0]" />
          <span className="text-xs text-[#64748B]">atau</span>
          <div className="h-px flex-1 bg-[#E2E8F0]" />
        </div>

        <a
          href={googleAuthHref}
          className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-4 py-2.5 text-sm font-medium text-[#0F172A] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] focus-visible:ring-offset-2 transition-colors"
        >
          <GoogleLogoIcon />
          <span>{mode === 'register' ? 'Daftar dengan Google' : 'Masuk dengan Google'}</span>
        </a>

      </div>
      <footer className="mt-5 text-xs text-[#64748B] text-center">
        &copy; {new Date().getFullYear()} Aldi Kurniawan. All rights reserved.
      </footer>
    </main>
  );
}
