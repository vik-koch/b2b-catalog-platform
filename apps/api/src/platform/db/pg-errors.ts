interface PgError {
  code?: string;
  constraint?: string;
}

/** Down the `cause` chain: drizzle wraps the driver's error, so the top-level
 * code alone sees nothing. */
function pgCause(error: unknown, code: string): PgError | undefined {
  for (let cause = error; cause; cause = (cause as { cause?: unknown }).cause) {
    if (typeof cause !== 'object') return undefined;
    if ((cause as PgError).code === code) return cause as PgError;
  }
  return undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return pgCause(error, '23505') !== undefined;
}

/** The constraint a unique violation names, to tell two keys apart. */
export function uniqueViolationConstraint(error: unknown): string | undefined {
  return pgCause(error, '23505')?.constraint;
}

/** 23001 is what an `ON DELETE RESTRICT` key raises; only `NO ACTION` keys
 * raise 23503. */
export function isForeignKeyViolation(error: unknown): boolean {
  return (
    pgCause(error, '23503') !== undefined ||
    pgCause(error, '23001') !== undefined
  );
}
