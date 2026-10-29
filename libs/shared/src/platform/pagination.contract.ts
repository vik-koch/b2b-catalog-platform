import * as z from 'zod';

/** The pagination envelope every paged list answers with. */
export const paginationSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();
export type Pagination = z.infer<typeof paginationSchema>;
