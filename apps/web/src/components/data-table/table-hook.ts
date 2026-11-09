import { createTableHook } from '@tanstack/react-table';
import { ColumnMenu } from './column-menu';
import { cellContext, headerContext, tableContext } from './context';
import { features } from './features';
import { TablePagination } from './pagination';

/**
 * The one table factory for the app: shared features, shared defaults and shared components.
 * Screens only describe their columns and data (see `useDataTable`).
 */
export const { useAppTable, createAppColumnHelper } = createTableHook({
  features,
  tableContext,
  cellContext,
  headerContext,
  tableComponents: { TablePagination, ColumnMenu },
  // Sorting only sees the rows on screen, so a column opts in rather than implying a full sort.
  enableSorting: false,
  enableMultiSort: false,
  autoResetPageIndex: false,
});
