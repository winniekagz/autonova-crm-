'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTableContext } from './context';

/** "Columns" popover that lets people hide the columns they do not need. */
export function ColumnMenu() {
  const table = useTableContext();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hideable = table.getAllLeafColumns().filter((column) => column.getCanHide());
  if (hideable.length === 0) return null;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:bg-canvas"
      >
        Columns
        <span aria-hidden="true" className="text-ink-muted">
          ▾
        </span>
      </button>
      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label="Visible columns"
          className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-line bg-surface p-2 shadow-lg"
        >
          {hideable.map((column) => {
            const header = column.columnDef.header;
            const label =
              column.columnDef.meta?.label ?? (typeof header === 'string' ? header : column.id);
            return (
              <label
                key={column.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-canvas"
              >
                <input
                  type="checkbox"
                  checked={column.getIsVisible()}
                  onChange={column.getToggleVisibilityHandler()}
                />
                {label}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
