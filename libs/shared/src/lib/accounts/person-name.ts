/**
 * How a person's name is written wherever the app composes one from its parts
 * — **family name first, no comma**.
 *
 * One rule, in one import-free module, because the alternative is what this
 * replaces: five call sites that each joined the two fields in whatever order
 * seemed natural at the time, so an account read "Alex Ivanov" in the customer
 * list and "Ivanov Alex" on the order it placed. Which order is right is a
 * matter of the shop's own convention; that the whole app answers it the same
 * way is not.
 *
 * No comma: the comma exists to mark an inversion in a list sorted by surname,
 * and every list here is already sorted that way. Written out it reads as
 * punctuation the reader has to parse.
 *
 * Either half may be missing — nothing enforces a name on a staff-created
 * account — so an absent one is dropped rather than left as a gap.
 */
export function formatPersonName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [lastName, firstName].filter(Boolean).join(' ');
}
