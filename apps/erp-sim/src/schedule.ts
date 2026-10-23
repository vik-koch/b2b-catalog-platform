/** When the back office is at work (simulation.json's `workingHours`). */
export interface WorkingHours {
  /** ISO weekdays: 1 is Monday, 7 Sunday. */
  readonly days: readonly number[];
  /** The first and the last hour a cycle starts in, on the shop's clock. */
  readonly from: number;
  readonly to: number;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The working hour `instant` falls in on the shop's clock, as a key such as
 * `2026-10-23 09` — one cycle per key — or null outside working hours.
 */
export function workingHour(
  instant: Date,
  timeZone: string,
  hours: WorkingHours,
): string | null {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, value]),
  );
  const day = WEEKDAYS.indexOf(parts['weekday']) + 1;
  const hour = Number(parts['hour']);
  if (!hours.days.includes(day) || hour < hours.from || hour > hours.to) {
    return null;
  }
  return `${parts['year']}-${parts['month']}-${parts['day']} ${parts['hour']}`;
}
