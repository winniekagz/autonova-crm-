'use client';

import { useTableContext } from './context';

/** Page numbers around the current page, with `null` standing for a gap ("…"). */
export function pageWindow(current: number, last: number): Array<number | null> {
  const wanted = new Set([1, last, current - 1, current, current + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  pages.forEach((p, i) => {
    const previous = pages[i - 1];
    if (previous !== undefined && p - previous > 1) out.push(null);
    out.push(p);
  });
  return out;
}

const NAV_BUTTON =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-line bg-surface px-2 text-[13px] text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-surface';

export function TablePagination() {
  const table = useTableContext();
  const { pageIndex } = table.state.pagination;
  const last = table.getPageCount();
  if (last <= 1) return null;
  const current = pageIndex + 1;

  return (
    <nav aria-label="Pagination" className="flex items-center gap-1">
      <span className="sr-only">
        Page {current} of {last}
      </span>
      <button
        type="button"
        className={NAV_BUTTON}
        disabled={!table.getCanPreviousPage()}
        onClick={() => table.previousPage()}
        aria-label="Previous"
      >
        <span aria-hidden="true">‹</span>
      </button>
      {pageWindow(current, last).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-ink-muted">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={
              p === current
                ? 'inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-primary px-2 text-[13px] font-medium text-white'
                : NAV_BUTTON
            }
            aria-label={`Page ${p}`}
            aria-current={p === current ? 'page' : undefined}
            onClick={() => table.setPageIndex(p - 1)}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className={NAV_BUTTON}
        disabled={!table.getCanNextPage()}
        onClick={() => table.nextPage()}
        aria-label="Next"
      >
        <span aria-hidden="true">›</span>
      </button>
    </nav>
  );
}
