/**
 * A person's name wherever the app composes one: family name first, no comma,
 * the same everywhere. Either half may be missing on a staff-created account,
 * and is dropped rather than left as a gap.
 */
export function formatPersonName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [lastName, firstName].filter(Boolean).join(' ');
}
