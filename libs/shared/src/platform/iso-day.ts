/** Today as an ISO day, the format every document date is kept in. */
export function isoToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
