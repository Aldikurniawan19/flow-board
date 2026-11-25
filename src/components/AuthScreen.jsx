import { useState } from 'react';
import { AlertCircle, Eye, EyeOff, Layers, Loader2, Lock, Mail, Moon, Sun, User } from 'lucide-react';
import { useBoardStore } from '../store/useBoardStore.js';

export function AuthScreen() {
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

      </div>
      <footer className="mt-5 text-xs text-[#64748B] text-center">
        &copy; {new Date().getFullYear()} Aldi Kurniawan. All rights reserved.
      </footer>
    </main>
  );
}
