/** Below this horizontal travel a touch gesture counts as a tap, not a swipe. */
export const SWIPE_THRESHOLD_PX = 30;

/** A one-finger horizontal swipe's step, the same for the tile's gallery and
 * the page's. */

export function swipeStep(startX: number, endX: number): -1 | 0 | 1 {
  const dx = endX - startX;
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return 0;
  return dx < 0 ? 1 : -1;
}

/** The x of a touch that has just started or just ended. */
export function touchX(event: TouchEvent): number {
  return event.changedTouches[0]?.clientX ?? 0;
}
