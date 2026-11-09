/** An ISO day `days` later, in UTC arithmetic so no zone's clock change
 * moves it. Today itself is the shop's: see `shopToday`. */
export function addIsoDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
