'use client';

import { FlexRender } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { DataTableApi } from './use-data-table';

interface DataTableProps<TData extends { id: string }> {
  table: DataTableApi<TData>;
  /** Plural noun used in labels and the footer, e.g. "users". */
  label: string;
  singular?: string;
  loading?: boolean;
  /** Safe, user-facing message. When set the table is replaced by the error and a retry button. */
  error?: string | null;
  onRetry?: () => void;
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode;
  /** Search and filters, shown above the table next to the column menu. */
  toolbar?: ReactNode;
  /** Keeps a stale page visible while the next one loads. */
  fetching?: boolean;
  /** Compact card for phones; when given, the table itself only shows from `md` up. */
  renderCard?: (row: TData) => ReactNode;
}

export function DataTable<TData extends { id: string }>({
  table,
  label,
  singular = label.replace(/s$/, ''),
  loading = false,
  error = null,
  onRetry,
  empty,
  toolbar,
  fetching = false,
  renderCard,
}: DataTableProps<TData>) {
  const rows = table.getRowModel().rows;
  const total = table.getRowCount();
  const sortable = table.getPageCount() <= 1;

  return (
    <table.AppTable>
      <div className="mt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">{toolbar}</div>
          <table.ColumnMenu />
        </div>

        <div className="mt-3" aria-live="polite" aria-busy={loading || fetching}>
          {loading ? (
            <TableSkeleton label={label} columns={table.getVisibleLeafColumns().length} />
          ) : null}

          {!loading && error ? (
            <div className="space-y-3">
              <Alert tone="error">{error}</Alert>
              {onRetry ? (
                <Button variant="secondary" onClick={onRetry}>
                  Try again
                </Button>
              ) : null}
            </div>
          ) : null}

          {!loading && !error && rows.length === 0 ? empty : null}

          {!loading && !error && rows.length > 0 ? (
            <>
              {renderCard ? (
                <ul
                  className={`space-y-2 md:hidden ${fetching ? 'opacity-60' : ''}`}
                  aria-label={label.charAt(0).toUpperCase() + label.slice(1)}
                >
                  {rows.map((row) => (
                    <li key={row.id} className="rounded-lg border border-line bg-surface p-3">
                      {renderCard(row.original)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div
                className={`overflow-x-auto rounded-lg border border-line bg-surface transition-opacity ${renderCard ? 'hidden md:block' : ''} ${fetching ? 'opacity-60' : ''}`}
              >
                <table className="w-full min-w-[640px] text-left text-[13px]">
                  <caption className="sr-only">{label}</caption>
                  <thead className="border-b border-line bg-canvas">
                    {table.getHeaderGroups().map((group) => (
                      <tr key={group.id}>
                        {group.headers.map((header) => {
                          const column = header.column;
                          const canSort = sortable && column.getCanSort();
                          const sorted = column.getIsSorted();
                          return (
                            <th
                              key={header.id}
                              scope="col"
                              aria-sort={
                                sorted === 'asc'
                                  ? 'ascending'
                                  : sorted === 'desc'
                                    ? 'descending'
                                    : undefined
                              }
                              className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft ${column.columnDef.meta?.className ?? ''}`}
                            >
                              {header.isPlaceholder ? null : canSort ? (
                                <button
                                  type="button"
                                  onClick={column.getToggleSortingHandler()}
                                  className="inline-flex items-center gap-1 uppercase hover:text-ink"
                                >
                                  <FlexRender header={header} />
                                  <span
                                    aria-hidden="true"
                                    className={sorted ? 'text-primary' : 'text-ink-muted'}
                                  >
                                    {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '↕'}
                                  </span>
                                </button>
                              ) : (
                                <FlexRender header={header} />
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-line last:border-0 hover:bg-canvas/70"
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className={`px-4 py-3 align-middle ${cell.column.columnDef.meta?.className ?? ''}`}
                          >
                            <FlexRender cell={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-ink-soft">
                  Showing <strong className="font-semibold text-primary">{rows.length}</strong> of{' '}
                  {total} {total === 1 ? singular : label}
                </p>
                <table.TablePagination />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </table.AppTable>
  );
}

function TableSkeleton({ label, columns }: { label: string; columns: number }) {
  return (
    <div
      role="status"
      aria-label={`Loading ${label}`}
      className="rounded-lg border border-line bg-surface"
    >
      <span className="sr-only">Loading {label}…</span>
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          key={row}
          className="flex items-center gap-6 border-b border-line px-4 py-4 last:border-0"
        >
          {Array.from({ length: Math.max(columns, 3) }, (_, cell) => (
            <div
              key={cell}
              className={`h-3 animate-pulse rounded bg-line ${cell === 0 ? 'w-40' : 'w-24'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
