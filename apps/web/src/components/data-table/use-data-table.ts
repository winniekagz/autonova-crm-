'use client';

import type { ColumnDef, SortingState, ColumnVisibilityState } from '@tanstack/react-table';
import { useMemo } from 'react';
import type { DataTableFeatures } from './features';
import { useAppTable } from './table-hook';

export type DataColumns<TData extends { id: string }> = Array<
  ColumnDef<DataTableFeatures, TData, any> // eslint-disable-line @typescript-eslint/no-explicit-any
>;

const NO_ROWS: never[] = [];

interface UseDataTableOptions<TData extends { id: string }> {
  /** Define at module scope or memoise: new columns on every render rebuild the table. */
  columns: DataColumns<TData>;
  data: TData[] | undefined;
  /** Server pagination. Omit `onPageChange` for a table that shows all of its rows. */
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  initialSorting?: SortingState;
  initialVisibility?: ColumnVisibilityState;
}

export function useDataTable<TData extends { id: string }>({
  columns,
  data,
  total,
  page = 1,
  pageSize = 20,
  onPageChange,
  initialSorting,
  initialVisibility,
}: UseDataTableOptions<TData>) {
  const rows = data ?? (NO_ROWS as TData[]);
  const paginated = onPageChange !== undefined;
  const pagination = useMemo(
    () =>
      paginated
        ? { pageIndex: page - 1, pageSize }
        : { pageIndex: 0, pageSize: Math.max(rows.length, 1) },
    [paginated, page, pageSize, rows.length],
  );

  return useAppTable({
    columns,
    data: rows,
    getRowId: (row) => row.id,
    manualPagination: true,
    rowCount: paginated ? (total ?? rows.length) : rows.length,
    state: { pagination },
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      onPageChange?.(next.pageIndex + 1);
    },
    initialState: { sorting: initialSorting, columnVisibility: initialVisibility },
  });
}

export type DataTableApi<TData extends { id: string }> = ReturnType<typeof useDataTable<TData>>;
