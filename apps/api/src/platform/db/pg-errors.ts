/**
 * Postgres error codes, wherever they sit: drizzle wraps the driver's error in
 * its own and hangs the original off `cause`, so a check on the top-level code
 * alone sees nothing and every refusal escapes as a 500.
 */
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

export function isForeignKeyViolation(error: unknown): boolean {
  return hasPgCode(error, '23503');
}
