'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DrawerProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Right-hand panel on a native <dialog>: focus is trapped, Escape closes it and the page behind is
 * inert. Children are only mounted while open, so a form inside always starts empty.
 */
export function Drawer({ open, title, description, onClose, children }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      className="fixed inset-y-0 right-0 m-0 ml-auto h-dvh max-h-none w-full max-w-xl overflow-hidden border-l border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-navy/40"
    >
      {open ? (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-navy">
                {title}
              </h2>
              {description ? <p className="mt-1 text-[13px] text-ink-soft">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-soft hover:bg-canvas hover:text-ink"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
