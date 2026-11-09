'use client';

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

/** Accessible tabs (WAI-ARIA): arrow keys move between tabs, only the active panel is mounted. */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id ?? '');
  const base = useId();

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = items[(index + step + items.length) % items.length];
    if (!next) return;
    setActive(next.id);
    document.getElementById(`${base}-tab-${next.id}`)?.focus();
  }

  const current = items.find((item) => item.id === active) ?? items[0];
  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {items.map((item, index) => {
          const selected = item.id === current?.id;
          return (
            <button
              key={item.id}
              id={`${base}-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${base}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium ${
                selected
                  ? 'border-primary text-primary'
                  : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {current ? (
        <div
          role="tabpanel"
          id={`${base}-panel-${current.id}`}
          aria-labelledby={`${base}-tab-${current.id}`}
          className="[&>*:first-child]:mt-4"
        >
          {current.content}
        </div>
      ) : null}
    </div>
  );
}
