import {
  columnVisibilityFeature,
  createSortedRowModel,
  metaHelper,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
} from '@tanstack/react-table';

export interface DataTableColumnMeta {
  /** Name shown in the "Columns" menu when the header is not plain text. */
  label?: string;
  /** Extra classes for the header and body cells, e.g. `text-right` or `w-12`. */
  className?: string;
}

/**
 * Every table in the app shares these features. Pagination is always server-owned (the URL holds
 * the page); sorting runs on the rows already loaded, so it is opt-in per column.
 */
export const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { text: sortFn_text, datetime: sortFn_datetime, basic: sortFn_basic },
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof features;
