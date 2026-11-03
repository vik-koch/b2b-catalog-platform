/**
 * Which days a customer may ask for (FR-CART-07). A wish, not a booking — but
 * a wish nobody can act on is worse than none, so the field offers only days
 * the shop could plausibly work on.
 *
 * Two rules, and deliberately no calendar: **not today**, because an order
 * placed this morning is picked and packed rather than handed over, and **not
 * a weekend**, because nothing leaves the building on one. Public holidays are
 * not modelled — they differ per deployment and per year, and a manager
 * confirms every date anyway, so a half-right calendar would be worse than the
 * two rules the customer can predict.
 *
 * Shared because both sides read it: the form draws its floor and its refusal
 * from here, and a draft restored from a previous visit is measured against
 * the same rule rather than a second copy of it.
 */

/** ISO `YYYY-MM-DD` as a day, not an instant: read in UTC throughout, so the
 * arithmetic never crosses a timezone and lands a day out. */
function day(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Saturday and Sunday. */
function isWeekend(date: Date): boolean {
  const weekday = date.getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * The earliest day that can be asked for, given the day the customer is
 * reading the form in: tomorrow, or the Monday after it where that falls on a
 * weekend.
 */
export function firstOrderDate(today: string): string {
  const date = day(today);
  if (!date) return today;
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (isWeekend(date));
  return toIso(date);
}

/**
 * Whether a date is one the shop offers. Anything unparseable is not — a field
 * holding half a date has nothing to send.
 */
export function isOrderDateAllowed(iso: string, today: string): boolean {
  const date = day(iso);
  if (!date) return false;
  return !isWeekend(date) && iso >= firstOrderDate(today);
}

/** Today where the reader is, in the field's own format. `en-CA` renders ISO,
 * which `toISOString` would not — that is UTC, and a day ahead or behind for
 * most of the world for part of every day. */
export function localToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA').format(now);
}
