/** A `page` query parameter as a page: anything but a positive whole number
 * is the first. */
export function pageNumber(raw: string): number {
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : 1;
}
