import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useBoardStore } from '../store/useBoardStore.js';

export function FeedbackBanner() {
  const feedback = useBoardStore((s) => s.feedback);
  const clearFeedback = useBoardStore((s) => s.clearFeedback);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => clearFeedback(), 4500);
    return () => clearTimeout(timer);
  }, [feedback, clearFeedback]);

  if (!feedback) return null;

  const styles =
    feedback.type === 'error'
      ? 'border-[#B91C1C]/30 bg-[#FEE2E2] text-[#B91C1C]'
      : feedback.type === 'success'
        ? 'border-[#15803D]/30 bg-[#DCFCE7] text-[#15803D]'
        : 'border-[#1D4ED8]/30 bg-[#DBEAFE] text-[#1D4ED8]';

  const Icon =
    feedback.type === 'error'
      ? AlertCircle
      : feedback.type === 'success'
        ? CheckCircle2
        : Info;

  return (
    <div
      role={feedback.type === 'error' ? 'alert' : 'status'}
      className={`fixed bottom-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm ${styles}`}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span>{feedback.message}</span>
      <button
        type="button"
        onClick={clearFeedback}
        aria-label="Tutup notifikasi"
        className="ml-1 rounded p-0.5 hover:bg-black/5"
      >
        <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
