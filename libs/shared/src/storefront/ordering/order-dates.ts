/**
 * Which days a customer may ask for (FR-CART-07): not today, and not a
 * weekend. No holiday calendar: a manager confirms every date, and a
 * half-right calendar is worse than two rules the customer can predict.
 */

/** A day, not an instant: UTC throughout, so no timezone moves it. */
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

/** Tomorrow, or the Monday after where that is a weekend. */
export function firstOrderDate(today: string): string {
  const date = day(today);
  if (!date) return today;
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (isWeekend(date));
  return toIso(date);
}

export function isOrderDateAllowed(iso: string, today: string): boolean {
  const date = day(iso);
  if (!date) return false;
  return !isWeekend(date) && iso >= firstOrderDate(today);
}

/** Today where the reader is: `toISOString` would be UTC, a day out for part
 * of every day. `en-CA` formats ISO. */
export function localToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA').format(now);
}
