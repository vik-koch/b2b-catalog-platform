import * as z from 'zod';

/**
 * A query parameter holding a list. A query string has no array type, so one
 * entry arrives bare and more as a list; both read as a list, absent as empty.
 */
export function listParam<T extends z.ZodType<string>>(item: T) {
  return z
    .union([item, z.array(item)])
    .optional()
    .transform((value): z.output<T>[] =>
      value === undefined ? [] : Array.isArray(value) ? value : [value],
    );
}
