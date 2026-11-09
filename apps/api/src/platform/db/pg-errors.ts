/** Down the `cause` chain: drizzle wraps the driver's error, so the top-level
 * code alone sees nothing. */
function hasPgCode(error: unknown, code: string): boolean {
  for (let cause = error; cause; cause = (cause as { cause?: unknown }).cause) {
    if (typeof cause !== 'object') return false;
    if ((cause as { code?: string }).code === code) return true;
  }
  return false;
}

export function isUniqueViolation(error: unknown): boolean {
  return hasPgCode(error, '23505');
}

/** 23001 is what an `ON DELETE RESTRICT` key raises; only `NO ACTION` keys
 * raise 23503. */
export function isForeignKeyViolation(error: unknown): boolean {
  return hasPgCode(error, '23503') || hasPgCode(error, '23001');
}
