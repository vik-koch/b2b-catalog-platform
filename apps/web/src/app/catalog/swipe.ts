/** Below this horizontal travel a touch gesture counts as a tap, not a swipe. */
export const SWIPE_THRESHOLD_PX = 30;

/**
 * A one-finger horizontal swipe, as the two galleries read it: which way it
 * went, or nothing where the finger barely moved.
 *
 * Shared so the tile and the product page agree on what counts as a swipe —
 * they are the same gesture on the same content, and a photo that steps on a
 * card but not on the page it links to is the kind of difference nobody
 * reports and everybody feels.
 */
export function swipeStep(startX: number, endX: number): -1 | 0 | 1 {
  const dx = endX - startX;
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return 0;
  return dx < 0 ? 1 : -1;
}

/** The x of a touch that has just started or just ended. */
export function touchX(event: TouchEvent): number {
  return event.changedTouches[0]?.clientX ?? 0;
}
