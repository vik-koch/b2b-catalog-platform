import * as z from 'zod';
import { SEARCH_QUERY_MAX_LENGTH } from './search';

/**
 * A search box as a query parameter. Free text: the server tokenizes it, and a
 * query with nothing searchable in it answers with an empty result, not an
 * error.
 */
export const searchQueryParamSchema = z
  .string()
  .max(SEARCH_QUERY_MAX_LENGTH)
  .optional()
  .default('');
