import { DestroyRef, inject, signal } from '@angular/core';

/**
 * Whether a disclosure is open, and whether the change should be animated.
 *
 * A panel that grows and shrinks may only do it when somebody asked. Both of
 * the app's disclosures are *also* layout: past a width the panel stops being
 * a disclosure and becomes a plain column, so the very class that says
 * "0fr" turns into "1fr" on a resize — and the panel played its opening
 * animation, in full, while a window edge was being dragged.
 *
 * Nothing about the state tells the two apart, so the transition is armed by
 * the toggle rather than left standing: a resize then changes the value with
 * no transition on the element to run. It disarms itself once the movement it
 * was armed for has had time to finish.
 */
export function disclosureState(durationMs: number) {
  const open = signal(false);
  const animated = signal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  inject(DestroyRef).onDestroy(() => clearTimeout(timer));

  return {
    open: open.asReadonly(),
    /** True only for as long as a toggle's own movement lasts. */
    animated: animated.asReadonly(),
    toggle(): void {
      open.update((was) => !was);
      animated.set(true);
      clearTimeout(timer);
      // A hair past the movement: disarming on the exact frame it ends can
      // catch the last one.
      timer = setTimeout(() => animated.set(false), durationMs + 50);
    },
  };
}
