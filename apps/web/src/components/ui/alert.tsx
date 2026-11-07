import type { ReactNode } from 'react';

type Tone = 'error' | 'success' | 'warning' | 'info';

const TONE: Record<Tone, string> = {
  error: 'border-danger/20 bg-danger-soft text-danger',
  success: 'border-success/20 bg-success-soft text-success',
  warning: 'border-warning/30 bg-warning-soft text-warning',
  info: 'border-line bg-canvas text-ink-soft',
};

/** `role="alert"` for errors (announced immediately), `role="status"` for everything else. */
export function Alert({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-md border px-3 py-2 text-[13px] ${TONE[tone]}`}
    >
      {children}
    </div>
  );
}
