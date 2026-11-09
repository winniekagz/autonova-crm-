import { createTableHookContexts } from '@tanstack/react-table';
import type { DataTableFeatures } from './features';

/**
 * Contexts live apart from the factory so registered components can read the table without a
 * circular import (factory -> components -> factory).
 */
export const { tableContext, cellContext, headerContext, useTableContext } =
  createTableHookContexts<DataTableFeatures>();
